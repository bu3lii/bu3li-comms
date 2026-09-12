// Package servers implements "servers" — a Discord-style container that
// owns multiple named channels (text + voice), with membership separate
// from any one channel, plus a small localized RBAC layer: every non-owner
// member has exactly one custom Role (per-server, not global) that grants a
// fixed set of permissions. Each channel is backed by an ordinary group
// conversation: messages, read receipts, reactions, and the existing
// mesh-voice machinery all work completely unchanged.
package servers

import (
	"context"
	"errors"
	"time"

	"github.com/bu3lii/bu3li-comms/internal/conversations"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrDefaultRole     = errors.New("the default role can't be deleted")
	ErrRoleNotFound    = errors.New("role not found")
	ErrChannelNotFound = errors.New("channel not found")
)

type Server struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	OwnerID   string    `json:"owner_id"`
	CreatedAt time.Time `json:"created_at"`
}

type Channel struct {
	ID             string `json:"id"`
	ServerID       string `json:"server_id"`
	ConversationID string `json:"conversation_id"`
	Name           string `json:"name"`
	Type           string `json:"type"`
	Position       int    `json:"position"`
}

// Role is a per-server (never global) named permission set. The special
// "owner" of a server isn't represented as a Role row — they always have
// every permission, computed directly from server_members.role = 'owner'.
type Role struct {
	ID                string `json:"id"`
	ServerID          string `json:"server_id"`
	Name              string `json:"name"`
	Color             string `json:"color"`
	IsDefault         bool   `json:"is_default"`
	Position          int    `json:"position"`
	IsAdmin           bool   `json:"is_admin"`
	CanManageServer   bool   `json:"can_manage_server"`
	CanManageRoles    bool   `json:"can_manage_roles"`
	CanManageChannels bool   `json:"can_manage_channels"`
	CanKickMembers    bool   `json:"can_kick_members"`
}

// RoleInput is what a caller may set when creating or editing a Role —
// everything except the identity/bookkeeping fields Role also carries.
type RoleInput struct {
	Name              string
	Color             string
	IsAdmin           bool
	CanManageServer   bool
	CanManageRoles    bool
	CanManageChannels bool
	CanKickMembers    bool
}

// Permissions is a user's *effective* permissions in one server: the
// owner's are always all-true; everyone else's come from their assigned
// Role, with IsAdmin acting as a blanket override (matching the "make an
// admin toggle" ask — a role with it set can do everything regardless of
// its other individual flags).
type Permissions struct {
	IsOwner        bool `json:"is_owner"`
	IsAdmin        bool `json:"is_admin"`
	ManageServer   bool `json:"manage_server"`
	ManageRoles    bool `json:"manage_roles"`
	ManageChannels bool `json:"manage_channels"`
	KickMembers    bool `json:"kick_members"`
}

func ownerPermissions() Permissions {
	return Permissions{IsOwner: true, IsAdmin: true, ManageServer: true, ManageRoles: true, ManageChannels: true, KickMembers: true}
}

func permissionsFromRole(role Role) Permissions {
	if role.IsAdmin {
		return Permissions{IsAdmin: true, ManageServer: true, ManageRoles: true, ManageChannels: true, KickMembers: true}
	}
	return Permissions{
		ManageServer:   role.CanManageServer,
		ManageRoles:    role.CanManageRoles,
		ManageChannels: role.CanManageChannels,
		KickMembers:    role.CanKickMembers,
	}
}

type Member struct {
	UserID        string    `json:"user_id"`
	Username      string    `json:"username"`
	HasAvatar     bool      `json:"has_avatar"`
	IsOwner       bool      `json:"is_owner"`
	RoleID        string    `json:"role_id,omitempty"`
	RoleName      string    `json:"role_name"`
	RoleColor     string    `json:"role_color"`
	JoinedAt      time.Time `json:"joined_at"`
	UserCreatedAt time.Time `json:"user_created_at"`
}

type Summary struct {
	ID          string      `json:"id"`
	Name        string      `json:"name"`
	OwnerID     string      `json:"owner_id"`
	HasIcon     bool        `json:"has_icon"`
	HasBanner   bool        `json:"has_banner"`
	Permissions Permissions `json:"permissions"`
	Channels    []Channel   `json:"channels"`
	Members     []Member    `json:"members"`
	Roles       []Role      `json:"roles"`
}

// Attachment is a small binary blob (icon/banner image), the same shape as
// a message's voice/media attachment or a user's avatar.
type Attachment struct {
	MimeType string
	Data     []byte
}

// MembershipNotifier lets presence sync immediately when a server member
// gains access to a channel's underlying conversation — the same interface
// shape as conversations.MembershipNotifier (and satisfied by the same
// realtime.Handler value), so a member added to a server sees their new
// channel-mates' online status right away instead of on next reconnect.
type MembershipNotifier interface {
	NotifyMembershipAdded(ctx context.Context, conversationID string, newUserID string)
}

type Service struct {
	db            *pgxpool.Pool
	conversations *conversations.Service
	notifier      MembershipNotifier
}

func NewService(db *pgxpool.Pool, conversationService *conversations.Service, notifier MembershipNotifier) *Service {
	return &Service{db: db, conversations: conversationService, notifier: notifier}
}

// Create makes a new server, adds ownerID as its owner, creates the default
// "Member" role, and creates a default "general" text channel.
func (s *Service) Create(ctx context.Context, name string, ownerID string) (Summary, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return Summary{}, err
	}
	defer tx.Rollback(ctx)

	var server Server
	err = tx.QueryRow(ctx, `
		INSERT INTO servers (name, owner_id)
		VALUES ($1, $2)
		RETURNING id, name, owner_id, created_at
	`, name, ownerID).Scan(&server.ID, &server.Name, &server.OwnerID, &server.CreatedAt)
	if err != nil {
		return Summary{}, err
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO server_members (server_id, user_id, role)
		VALUES ($1, $2, 'owner')
	`, server.ID, ownerID)
	if err != nil {
		return Summary{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return Summary{}, err
	}

	if _, err := s.createDefaultRole(ctx, server.ID); err != nil {
		return Summary{}, err
	}
	if _, err := s.CreateChannel(ctx, server.ID, "general", "text"); err != nil {
		return Summary{}, err
	}

	return s.Get(ctx, server.ID, ownerID)
}

func (s *Service) createDefaultRole(ctx context.Context, serverID string) (Role, error) {
	var role Role
	err := s.db.QueryRow(ctx, `
		INSERT INTO server_roles (server_id, name, color, is_default, position)
		VALUES ($1, 'Member', '#9298A6', TRUE, 0)
		RETURNING id, server_id, name, color, is_default, position, is_admin, can_manage_server, can_manage_roles, can_manage_channels, can_kick_members
	`, serverID).Scan(
		&role.ID, &role.ServerID, &role.Name, &role.Color, &role.IsDefault, &role.Position,
		&role.IsAdmin, &role.CanManageServer, &role.CanManageRoles, &role.CanManageChannels, &role.CanKickMembers,
	)
	return role, err
}

func (s *Service) defaultRoleID(ctx context.Context, serverID string) (string, error) {
	var id string
	err := s.db.QueryRow(ctx, `
		SELECT id FROM server_roles WHERE server_id = $1 AND is_default LIMIT 1
	`, serverID).Scan(&id)
	return id, err
}

// Permissions returns userID's effective permissions in serverID, or an
// error (pgx.ErrNoRows) if they aren't a member — every handler in this
// package uses this both to authorize an action and, incidentally, to
// check membership in one query.
func (s *Service) Permissions(ctx context.Context, serverID string, userID string) (Permissions, error) {
	var isOwner bool
	var role Role

	err := s.db.QueryRow(ctx, `
		SELECT sm.role = 'owner',
			COALESCE(r.is_admin, FALSE), COALESCE(r.can_manage_server, FALSE),
			COALESCE(r.can_manage_roles, FALSE), COALESCE(r.can_manage_channels, FALSE), COALESCE(r.can_kick_members, FALSE)
		FROM server_members sm
		LEFT JOIN server_roles r ON r.id = sm.role_id
		WHERE sm.server_id = $1 AND sm.user_id = $2
	`, serverID, userID).Scan(&isOwner, &role.IsAdmin, &role.CanManageServer, &role.CanManageRoles, &role.CanManageChannels, &role.CanKickMembers)
	if err != nil {
		return Permissions{}, err
	}

	if isOwner {
		return ownerPermissions(), nil
	}
	return permissionsFromRole(role), nil
}

func (s *Service) ListMemberIDs(ctx context.Context, serverID string) ([]string, error) {
	rows, err := s.db.Query(ctx, `SELECT user_id FROM server_members WHERE server_id = $1`, serverID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func (s *Service) ListChannels(ctx context.Context, serverID string) ([]Channel, error) {
	rows, err := s.db.Query(ctx, `
		SELECT id, server_id, conversation_id, name, type, position
		FROM server_channels
		WHERE server_id = $1
		ORDER BY position, created_at
	`, serverID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	channels := []Channel{}
	for rows.Next() {
		var channel Channel
		if err := rows.Scan(&channel.ID, &channel.ServerID, &channel.ConversationID, &channel.Name, &channel.Type, &channel.Position); err != nil {
			return nil, err
		}
		channels = append(channels, channel)
	}
	return channels, rows.Err()
}

func (s *Service) ListRoles(ctx context.Context, serverID string) ([]Role, error) {
	rows, err := s.db.Query(ctx, `
		SELECT id, server_id, name, color, is_default, position, is_admin, can_manage_server, can_manage_roles, can_manage_channels, can_kick_members
		FROM server_roles
		WHERE server_id = $1
		ORDER BY position, created_at
	`, serverID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	roles := []Role{}
	for rows.Next() {
		var role Role
		if err := rows.Scan(&role.ID, &role.ServerID, &role.Name, &role.Color, &role.IsDefault, &role.Position, &role.IsAdmin, &role.CanManageServer, &role.CanManageRoles, &role.CanManageChannels, &role.CanKickMembers); err != nil {
			return nil, err
		}
		roles = append(roles, role)
	}
	return roles, rows.Err()
}

func (s *Service) ListMembers(ctx context.Context, serverID string) ([]Member, error) {
	rows, err := s.db.Query(ctx, `
		SELECT sm.user_id, u.username, (sm.role = 'owner'), sm.joined_at, u.created_at,
			EXISTS(SELECT 1 FROM user_avatars a WHERE a.user_id = u.id),
			COALESCE(r.id::text, ''), COALESCE(r.name, ''), COALESCE(r.color, '')
		FROM server_members sm
		JOIN users u ON u.id = sm.user_id
		LEFT JOIN server_roles r ON r.id = sm.role_id
		WHERE sm.server_id = $1
		ORDER BY (sm.role = 'owner') DESC, u.username
	`, serverID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	members := []Member{}
	for rows.Next() {
		var member Member
		if err := rows.Scan(
			&member.UserID, &member.Username, &member.IsOwner, &member.JoinedAt, &member.UserCreatedAt,
			&member.HasAvatar, &member.RoleID, &member.RoleName, &member.RoleColor,
		); err != nil {
			return nil, err
		}
		if member.IsOwner {
			member.RoleName = "Owner"
		}
		members = append(members, member)
	}
	return members, rows.Err()
}

// Get returns serverID's full detail if userID belongs to it, or an error
// (pgx.ErrNoRows) if not — the handler treats that as "not found" rather
// than leaking that the server exists.
func (s *Service) Get(ctx context.Context, serverID string, userID string) (Summary, error) {
	permissions, err := s.Permissions(ctx, serverID, userID)
	if err != nil {
		return Summary{}, err
	}

	var server Server
	var hasIcon, hasBanner bool
	err = s.db.QueryRow(ctx, `
		SELECT s.id, s.name, s.owner_id, s.created_at,
			EXISTS(SELECT 1 FROM server_icons i WHERE i.server_id = s.id),
			EXISTS(SELECT 1 FROM server_banners b WHERE b.server_id = s.id)
		FROM servers s
		WHERE s.id = $1
	`, serverID).Scan(&server.ID, &server.Name, &server.OwnerID, &server.CreatedAt, &hasIcon, &hasBanner)
	if err != nil {
		return Summary{}, err
	}

	channels, err := s.ListChannels(ctx, serverID)
	if err != nil {
		return Summary{}, err
	}

	members, err := s.ListMembers(ctx, serverID)
	if err != nil {
		return Summary{}, err
	}

	roles, err := s.ListRoles(ctx, serverID)
	if err != nil {
		return Summary{}, err
	}

	return Summary{
		ID: server.ID, Name: server.Name, OwnerID: server.OwnerID,
		HasIcon: hasIcon, HasBanner: hasBanner, Permissions: permissions,
		Channels: channels, Members: members, Roles: roles,
	}, nil
}

// ListForUser returns every server userID belongs to, each with its full
// detail, batched (one query per table, not per server).
func (s *Service) ListForUser(ctx context.Context, userID string) ([]Summary, error) {
	rows, err := s.db.Query(ctx, `
		SELECT s.id, s.name, s.owner_id, s.created_at,
			EXISTS(SELECT 1 FROM server_icons i WHERE i.server_id = s.id),
			EXISTS(SELECT 1 FROM server_banners b WHERE b.server_id = s.id)
		FROM servers s
		JOIN server_members sm ON sm.server_id = s.id
		WHERE sm.user_id = $1
		ORDER BY s.created_at
	`, userID)
	if err != nil {
		return nil, err
	}

	summaries := []Summary{}
	order := []string{}

	for rows.Next() {
		var server Server
		var hasIcon, hasBanner bool
		if err := rows.Scan(&server.ID, &server.Name, &server.OwnerID, &server.CreatedAt, &hasIcon, &hasBanner); err != nil {
			rows.Close()
			return nil, err
		}
		summaries = append(summaries, Summary{
			ID: server.ID, Name: server.Name, OwnerID: server.OwnerID,
			HasIcon: hasIcon, HasBanner: hasBanner,
			Channels: []Channel{}, Members: []Member{}, Roles: []Role{},
		})
		order = append(order, server.ID)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}

	if len(order) == 0 {
		return summaries, nil
	}

	byID := make(map[string]*Summary, len(summaries))
	for i := range summaries {
		byID[summaries[i].ID] = &summaries[i]
		permissions, err := s.Permissions(ctx, summaries[i].ID, userID)
		if err != nil {
			return nil, err
		}
		summaries[i].Permissions = permissions
	}

	channelRows, err := s.db.Query(ctx, `
		SELECT server_id, id, conversation_id, name, type, position
		FROM server_channels
		WHERE server_id = ANY($1)
		ORDER BY server_id, position, created_at
	`, order)
	if err != nil {
		return nil, err
	}
	for channelRows.Next() {
		var serverID string
		var channel Channel
		if err := channelRows.Scan(&serverID, &channel.ID, &channel.ConversationID, &channel.Name, &channel.Type, &channel.Position); err != nil {
			channelRows.Close()
			return nil, err
		}
		channel.ServerID = serverID
		if summary, ok := byID[serverID]; ok {
			summary.Channels = append(summary.Channels, channel)
		}
	}
	channelRows.Close()
	if err := channelRows.Err(); err != nil {
		return nil, err
	}

	memberRows, err := s.db.Query(ctx, `
		SELECT sm.server_id, sm.user_id, u.username, (sm.role = 'owner'), sm.joined_at, u.created_at,
			EXISTS(SELECT 1 FROM user_avatars a WHERE a.user_id = u.id),
			COALESCE(r.id::text, ''), COALESCE(r.name, ''), COALESCE(r.color, '')
		FROM server_members sm
		JOIN users u ON u.id = sm.user_id
		LEFT JOIN server_roles r ON r.id = sm.role_id
		WHERE sm.server_id = ANY($1)
		ORDER BY sm.server_id, (sm.role = 'owner') DESC, u.username
	`, order)
	if err != nil {
		return nil, err
	}
	defer memberRows.Close()
	for memberRows.Next() {
		var serverID string
		var member Member
		if err := memberRows.Scan(
			&serverID, &member.UserID, &member.Username, &member.IsOwner, &member.JoinedAt, &member.UserCreatedAt,
			&member.HasAvatar, &member.RoleID, &member.RoleName, &member.RoleColor,
		); err != nil {
			return nil, err
		}
		if member.IsOwner {
			member.RoleName = "Owner"
		}
		if summary, ok := byID[serverID]; ok {
			summary.Members = append(summary.Members, member)
		}
	}
	if err := memberRows.Err(); err != nil {
		return nil, err
	}

	roleRows, err := s.db.Query(ctx, `
		SELECT server_id, id, name, color, is_default, position, is_admin, can_manage_server, can_manage_roles, can_manage_channels, can_kick_members
		FROM server_roles
		WHERE server_id = ANY($1)
		ORDER BY server_id, position, created_at
	`, order)
	if err != nil {
		return nil, err
	}
	defer roleRows.Close()
	for roleRows.Next() {
		var serverID string
		var role Role
		if err := roleRows.Scan(&serverID, &role.ID, &role.Name, &role.Color, &role.IsDefault, &role.Position, &role.IsAdmin, &role.CanManageServer, &role.CanManageRoles, &role.CanManageChannels, &role.CanKickMembers); err != nil {
			return nil, err
		}
		role.ServerID = serverID
		if summary, ok := byID[serverID]; ok {
			summary.Roles = append(summary.Roles, role)
		}
	}
	if err := roleRows.Err(); err != nil {
		return nil, err
	}

	return summaries, nil
}

// AddMember adds userID to the server (assigned the default role) and to
// every existing channel's underlying conversation.
func (s *Service) AddMember(ctx context.Context, serverID string, userID string) error {
	defaultRoleID, err := s.defaultRoleID(ctx, serverID)
	if err != nil {
		return err
	}

	_, err = s.db.Exec(ctx, `
		INSERT INTO server_members (server_id, user_id, role, role_id)
		VALUES ($1, $2, 'member', $3)
		ON CONFLICT DO NOTHING
	`, serverID, userID, defaultRoleID)
	if err != nil {
		return err
	}

	channels, err := s.ListChannels(ctx, serverID)
	if err != nil {
		return err
	}

	for _, channel := range channels {
		if err := s.conversations.AddMember(ctx, channel.ConversationID, userID); err != nil {
			return err
		}
		if s.notifier != nil {
			s.notifier.NotifyMembershipAdded(ctx, channel.ConversationID, userID)
		}
	}

	return nil
}

// RemoveMember removes userID from the server and every channel's
// conversation — used for both a permitted member kicking someone and a
// member leaving on their own.
func (s *Service) RemoveMember(ctx context.Context, serverID string, userID string) error {
	channels, err := s.ListChannels(ctx, serverID)
	if err != nil {
		return err
	}

	for _, channel := range channels {
		_, err := s.db.Exec(ctx, `
			DELETE FROM conversation_members WHERE conversation_id = $1 AND user_id = $2
		`, channel.ConversationID, userID)
		if err != nil {
			return err
		}
	}

	_, err = s.db.Exec(ctx, `
		DELETE FROM server_members WHERE server_id = $1 AND user_id = $2
	`, serverID, userID)
	return err
}

// AssignRole sets a non-owner member's role. roleID must belong to
// serverID; the owner's row (role = 'owner') is left untouched even if
// targeted, since they aren't role-based.
func (s *Service) AssignRole(ctx context.Context, serverID string, userID string, roleID string) error {
	var exists bool
	err := s.db.QueryRow(ctx, `
		SELECT EXISTS(SELECT 1 FROM server_roles WHERE id = $1 AND server_id = $2)
	`, roleID, serverID).Scan(&exists)
	if err != nil {
		return err
	}
	if !exists {
		return ErrRoleNotFound
	}

	_, err = s.db.Exec(ctx, `
		UPDATE server_members SET role_id = $1
		WHERE server_id = $2 AND user_id = $3 AND role != 'owner'
	`, roleID, serverID, userID)
	return err
}

func (s *Service) CreateRole(ctx context.Context, serverID string, input RoleInput) (Role, error) {
	var position int
	err := s.db.QueryRow(ctx, `
		SELECT COALESCE(MAX(position) + 1, 1) FROM server_roles WHERE server_id = $1
	`, serverID).Scan(&position)
	if err != nil {
		return Role{}, err
	}

	var role Role
	err = s.db.QueryRow(ctx, `
		INSERT INTO server_roles (server_id, name, color, position, is_admin, can_manage_server, can_manage_roles, can_manage_channels, can_kick_members)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING id, server_id, name, color, is_default, position, is_admin, can_manage_server, can_manage_roles, can_manage_channels, can_kick_members
	`, serverID, input.Name, input.Color, position, input.IsAdmin, input.CanManageServer, input.CanManageRoles, input.CanManageChannels, input.CanKickMembers).Scan(
		&role.ID, &role.ServerID, &role.Name, &role.Color, &role.IsDefault, &role.Position,
		&role.IsAdmin, &role.CanManageServer, &role.CanManageRoles, &role.CanManageChannels, &role.CanKickMembers,
	)
	return role, err
}

// UpdateRole edits a role's name/color/permissions. Even the default role
// can have its permissions changed (e.g. letting every plain member manage
// channels) — only deleting it is disallowed, since a member always needs
// some role to fall back on.
func (s *Service) UpdateRole(ctx context.Context, serverID string, roleID string, input RoleInput) (Role, error) {
	var role Role
	err := s.db.QueryRow(ctx, `
		UPDATE server_roles
		SET name = $1, color = $2, is_admin = $3, can_manage_server = $4, can_manage_roles = $5, can_manage_channels = $6, can_kick_members = $7
		WHERE id = $8 AND server_id = $9
		RETURNING id, server_id, name, color, is_default, position, is_admin, can_manage_server, can_manage_roles, can_manage_channels, can_kick_members
	`, input.Name, input.Color, input.IsAdmin, input.CanManageServer, input.CanManageRoles, input.CanManageChannels, input.CanKickMembers, roleID, serverID).Scan(
		&role.ID, &role.ServerID, &role.Name, &role.Color, &role.IsDefault, &role.Position,
		&role.IsAdmin, &role.CanManageServer, &role.CanManageRoles, &role.CanManageChannels, &role.CanKickMembers,
	)
	return role, err
}

// DeleteRole removes a non-default role, reassigning any members who had it
// to the server's default role first so nobody is left without one.
func (s *Service) DeleteRole(ctx context.Context, serverID string, roleID string) error {
	var isDefault bool
	err := s.db.QueryRow(ctx, `
		SELECT is_default FROM server_roles WHERE id = $1 AND server_id = $2
	`, roleID, serverID).Scan(&isDefault)
	if err != nil {
		return err
	}
	if isDefault {
		return ErrDefaultRole
	}

	defaultRoleID, err := s.defaultRoleID(ctx, serverID)
	if err != nil {
		return err
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, `
		UPDATE server_members SET role_id = $1 WHERE server_id = $2 AND role_id = $3
	`, defaultRoleID, serverID, roleID)
	if err != nil {
		return err
	}

	_, err = tx.Exec(ctx, `DELETE FROM server_roles WHERE id = $1`, roleID)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// UpdateName renames a server.
func (s *Service) UpdateName(ctx context.Context, serverID string, name string) (Server, error) {
	var server Server
	err := s.db.QueryRow(ctx, `
		UPDATE servers SET name = $1 WHERE id = $2
		RETURNING id, name, owner_id, created_at
	`, name, serverID).Scan(&server.ID, &server.Name, &server.OwnerID, &server.CreatedAt)
	return server, err
}

func (s *Service) UpsertIcon(ctx context.Context, serverID string, mimeType string, data []byte) error {
	_, err := s.db.Exec(ctx, `
		INSERT INTO server_icons (server_id, mime_type, data)
		VALUES ($1, $2, $3)
		ON CONFLICT (server_id) DO UPDATE SET mime_type = excluded.mime_type, data = excluded.data, updated_at = NOW()
	`, serverID, mimeType, data)
	return err
}

func (s *Service) GetIcon(ctx context.Context, serverID string) (Attachment, error) {
	var attachment Attachment
	err := s.db.QueryRow(ctx, `SELECT mime_type, data FROM server_icons WHERE server_id = $1`, serverID).Scan(&attachment.MimeType, &attachment.Data)
	return attachment, err
}

func (s *Service) DeleteIcon(ctx context.Context, serverID string) error {
	_, err := s.db.Exec(ctx, `DELETE FROM server_icons WHERE server_id = $1`, serverID)
	return err
}

func (s *Service) UpsertBanner(ctx context.Context, serverID string, mimeType string, data []byte) error {
	_, err := s.db.Exec(ctx, `
		INSERT INTO server_banners (server_id, mime_type, data)
		VALUES ($1, $2, $3)
		ON CONFLICT (server_id) DO UPDATE SET mime_type = excluded.mime_type, data = excluded.data, updated_at = NOW()
	`, serverID, mimeType, data)
	return err
}

func (s *Service) GetBanner(ctx context.Context, serverID string) (Attachment, error) {
	var attachment Attachment
	err := s.db.QueryRow(ctx, `SELECT mime_type, data FROM server_banners WHERE server_id = $1`, serverID).Scan(&attachment.MimeType, &attachment.Data)
	return attachment, err
}

func (s *Service) DeleteBanner(ctx context.Context, serverID string) error {
	_, err := s.db.Exec(ctx, `DELETE FROM server_banners WHERE server_id = $1`, serverID)
	return err
}

// CreateChannel creates a channel's underlying conversation with every
// current server member already in it, then records the channel row.
func (s *Service) CreateChannel(ctx context.Context, serverID string, name string, channelType string) (Channel, error) {
	memberIDs, err := s.ListMemberIDs(ctx, serverID)
	if err != nil {
		return Channel{}, err
	}

	conversation, err := s.conversations.CreateWithMembers(ctx, "group", memberIDs)
	if err != nil {
		return Channel{}, err
	}

	var position int
	err = s.db.QueryRow(ctx, `
		SELECT COALESCE(MAX(position) + 1, 0) FROM server_channels WHERE server_id = $1
	`, serverID).Scan(&position)
	if err != nil {
		return Channel{}, err
	}

	var channel Channel
	err = s.db.QueryRow(ctx, `
		INSERT INTO server_channels (server_id, conversation_id, name, type, position)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, server_id, conversation_id, name, type, position
	`, serverID, conversation.ID, name, channelType, position).Scan(
		&channel.ID, &channel.ServerID, &channel.ConversationID, &channel.Name, &channel.Type, &channel.Position,
	)
	return channel, err
}

// ReorderChannels sets each channel's position to its index in channelIDs.
// channelIDs must name every channel belonging to serverID, in the new
// order — a partial list would leave the omitted channels' positions
// untouched but internally inconsistent with the reordered ones, so the
// caller (the handler) is expected to always send the full list.
func (s *Service) ReorderChannels(ctx context.Context, serverID string, channelIDs []string) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	for position, channelID := range channelIDs {
		tag, err := tx.Exec(ctx, `
			UPDATE server_channels SET position = $1 WHERE id = $2 AND server_id = $3
		`, position, channelID, serverID)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrChannelNotFound
		}
	}

	return tx.Commit(ctx)
}

// DeleteChannel removes a channel by deleting its underlying conversation
// — message_attachments/messages/conversation_members and the
// server_channels row itself all cascade from that one delete.
func (s *Service) DeleteChannel(ctx context.Context, serverID string, channelID string) error {
	var conversationID string
	err := s.db.QueryRow(ctx, `
		SELECT conversation_id FROM server_channels WHERE id = $1 AND server_id = $2
	`, channelID, serverID).Scan(&conversationID)
	if err != nil {
		return err
	}

	_, err = s.db.Exec(ctx, `DELETE FROM conversations WHERE id = $1`, conversationID)
	return err
}

// DeleteServer removes every channel's underlying conversation, then the
// server itself (which cascades server_members and server_roles).
func (s *Service) DeleteServer(ctx context.Context, serverID string) error {
	_, err := s.db.Exec(ctx, `
		DELETE FROM conversations
		WHERE id IN (SELECT conversation_id FROM server_channels WHERE server_id = $1)
	`, serverID)
	if err != nil {
		return err
	}

	_, err = s.db.Exec(ctx, `DELETE FROM servers WHERE id = $1`, serverID)
	return err
}
