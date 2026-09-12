package conversations

import (
	"context"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Conversation struct {
	ID   string `json:"id"`
	Type string `json:"type"`
}

type Member struct {
	ID        string `json:"id"`
	Username  string `json:"username"`
	HasAvatar bool   `json:"has_avatar"`
}

type LastMessage struct {
	ID             string `json:"id"`
	SenderID       string `json:"sender_id"`
	Content        string `json:"content"`
	HasAttachment  bool   `json:"has_attachment"`
	AttachmentKind string `json:"attachment_kind,omitempty"`
	CreatedAt      string `json:"created_at"`
}

// attachmentKindFromMime mirrors internal/messages' helper of the same
// name. Duplicated rather than imported: internal/messages already imports
// this package for membership checks, and this package importing it back
// would be a cycle for two lines of logic.
func attachmentKindFromMime(mimeType string) string {
	switch {
	case strings.HasPrefix(mimeType, "audio/"):
		return "audio"
	case strings.HasPrefix(mimeType, "image/"):
		return "image"
	case strings.HasPrefix(mimeType, "video/"):
		return "video"
	default:
		return ""
	}
}

type Summary struct {
	ID          string       `json:"id"`
	Type        string       `json:"type"`
	Members     []Member     `json:"members"`
	LastMessage *LastMessage `json:"last_message,omitempty"`
	UnreadCount int          `json:"unread_count"`
}

type Service struct {
	db *pgxpool.Pool
}

func NewService(db *pgxpool.Pool) *Service {
	return &Service{db: db}
}

func (s *Service) Create(ctx context.Context, conversationType string, creatorID string) (Conversation, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return Conversation{}, err
	}
	defer tx.Rollback(ctx)

	var conversation Conversation

	err = tx.QueryRow(ctx, `
		INSERT INTO conversations (type)
		VALUES ($1)
		RETURNING id, type
	`, conversationType).Scan(&conversation.ID, &conversation.Type)

	if err != nil {
		return Conversation{}, err
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO conversation_members (conversation_id, user_id)
		VALUES ($1, $2)
	`, conversation.ID, creatorID)

	if err != nil {
		return Conversation{}, err
	}

	err = tx.Commit(ctx)

	if err != nil {
		return Conversation{}, err
	}

	return conversation, nil
}

// CreateWithMembers creates a conversation with every given user already a
// member, in one transaction. Used by internal/servers when creating a
// channel: unlike Create's single-creator flow for a DM/group started from
// the UI, a new channel should be immediately usable by every current
// server member, not just whoever clicked "create channel".
func (s *Service) CreateWithMembers(ctx context.Context, conversationType string, memberIDs []string) (Conversation, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return Conversation{}, err
	}
	defer tx.Rollback(ctx)

	var conversation Conversation

	err = tx.QueryRow(ctx, `
		INSERT INTO conversations (type)
		VALUES ($1)
		RETURNING id, type
	`, conversationType).Scan(&conversation.ID, &conversation.Type)
	if err != nil {
		return Conversation{}, err
	}

	for _, userID := range memberIDs {
		_, err = tx.Exec(ctx, `
			INSERT INTO conversation_members (conversation_id, user_id)
			VALUES ($1, $2)
		`, conversation.ID, userID)
		if err != nil {
			return Conversation{}, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return Conversation{}, err
	}

	return conversation, nil
}

func (s *Service) GetType(ctx context.Context, conversationID string) (string, error) {
	var conversationType string

	err := s.db.QueryRow(ctx, `
		SELECT type
		FROM conversations
		WHERE id = $1
	`, conversationID).Scan(&conversationType)

	return conversationType, err
}

func (s *Service) IsMember(ctx context.Context, conversationID string, userID string) (bool, error) {
	var exists bool

	err := s.db.QueryRow(ctx, `
	SELECT EXISTS(
		SELECT 1
		FROM conversation_members
		WHERE conversation_id = $1
		AND user_id = $2
	)
	`, conversationID, userID).Scan(&exists)

	return exists, err
}

func (s *Service) AddMember(ctx context.Context, conversationID string, userID string) error {
	_, err := s.db.Exec(ctx, `
		INSERT INTO conversation_members (conversation_id, user_id)
		VALUES ($1, $2)
		ON CONFLICT DO NOTHING
	`, conversationID, userID)

	return err
}

func (s *Service) ListMemberIDs(ctx context.Context, conversationID string) ([]string, error) {
	rows, err := s.db.Query(ctx, `
		SELECT user_id
		FROM conversation_members
		WHERE conversation_id = $1
	`, conversationID)

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []string

	for rows.Next() {
		var id string

		err = rows.Scan(&id)
		if err != nil {
			return nil, err
		}

		ids = append(ids, id)
	}

	return ids, rows.Err()
}

// ListForUser returns every conversation userID belongs to, each with its
// member list and most recent message, newest activity first. There's no
// pagination yet — fine for a personal/demo-scale account, not for someone
// in thousands of conversations.
func (s *Service) ListForUser(ctx context.Context, userID string) ([]Summary, error) {
	rows, err := s.db.Query(ctx, `
		SELECT c.id, c.type
		FROM conversations c
		JOIN conversation_members cm ON cm.conversation_id = c.id
		WHERE cm.user_id = $1
			-- Server channels are conversations too (see internal/servers), but
			-- they're listed under their server, not in the flat DM/group list.
			AND NOT EXISTS (SELECT 1 FROM server_channels sc WHERE sc.conversation_id = c.id)
		ORDER BY COALESCE(
			(SELECT MAX(created_at) FROM messages WHERE conversation_id = c.id),
			c.created_at
		) DESC
	`, userID)
	if err != nil {
		return nil, err
	}

	summaries := []Summary{}
	order := []string{}
	byID := map[string]*Summary{}

	for rows.Next() {
		var summary Summary

		err := rows.Scan(&summary.ID, &summary.Type)
		if err != nil {
			rows.Close()
			return nil, err
		}

		summaries = append(summaries, summary)
		order = append(order, summary.ID)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}

	for i := range summaries {
		byID[summaries[i].ID] = &summaries[i]
	}

	if len(order) == 0 {
		return summaries, nil
	}

	memberRows, err := s.db.Query(ctx, `
		SELECT cm.conversation_id, u.id, u.username,
			EXISTS(SELECT 1 FROM user_avatars a WHERE a.user_id = u.id)
		FROM conversation_members cm
		JOIN users u ON u.id = cm.user_id
		WHERE cm.conversation_id = ANY($1)
	`, order)
	if err != nil {
		return nil, err
	}
	defer memberRows.Close()

	for memberRows.Next() {
		var conversationID string
		var member Member

		err := memberRows.Scan(&conversationID, &member.ID, &member.Username, &member.HasAvatar)
		if err != nil {
			return nil, err
		}

		if summary, ok := byID[conversationID]; ok {
			summary.Members = append(summary.Members, member)
		}
	}
	if err := memberRows.Err(); err != nil {
		return nil, err
	}

	messageRows, err := s.db.Query(ctx, `
		SELECT DISTINCT ON (m.conversation_id)
			m.conversation_id, m.id, m.sender_id, COALESCE(m.content, ''), m.created_at,
			(a.message_id IS NOT NULL) AS has_attachment, COALESCE(a.mime_type, '')
		FROM messages m
		LEFT JOIN message_attachments a ON a.message_id = m.id
		WHERE m.conversation_id = ANY($1)
		ORDER BY m.conversation_id, m.created_at DESC
	`, order)
	if err != nil {
		return nil, err
	}
	defer messageRows.Close()

	for messageRows.Next() {
		var conversationID string
		var last LastMessage
		var createdAt time.Time
		var mimeType string

		err := messageRows.Scan(&conversationID, &last.ID, &last.SenderID, &last.Content, &createdAt, &last.HasAttachment, &mimeType)
		if err != nil {
			return nil, err
		}
		last.CreatedAt = createdAt.Format(time.RFC3339Nano)
		if last.HasAttachment {
			last.AttachmentKind = attachmentKindFromMime(mimeType)
		}

		if summary, ok := byID[conversationID]; ok {
			summary.LastMessage = &last
		}
	}
	if err := messageRows.Err(); err != nil {
		return nil, err
	}

	// Unread = messages someone else sent in the conversation that userID
	// hasn't left a read receipt for yet. Reuses message_receipts as-is,
	// no new schema needed.
	unreadRows, err := s.db.Query(ctx, `
		SELECT m.conversation_id, COUNT(*)
		FROM messages m
		WHERE m.conversation_id = ANY($1)
			AND m.sender_id != $2
			AND NOT EXISTS (
				SELECT 1 FROM message_receipts r
				WHERE r.message_id = m.id AND r.user_id = $2
			)
		GROUP BY m.conversation_id
	`, order, userID)
	if err != nil {
		return nil, err
	}
	defer unreadRows.Close()

	for unreadRows.Next() {
		var conversationID string
		var count int

		if err := unreadRows.Scan(&conversationID, &count); err != nil {
			return nil, err
		}

		if summary, ok := byID[conversationID]; ok {
			summary.UnreadCount = count
		}
	}
	if err := unreadRows.Err(); err != nil {
		return nil, err
	}

	return summaries, nil
}

func (s *Service) ListPeerIDs(ctx context.Context, userID string) ([]string, error) {
	rows, err := s.db.Query(ctx, `
		SELECT DISTINCT cm2.user_id
		FROM conversation_members cm1
		JOIN conversation_members cm2
			ON cm1.conversation_id = cm2.conversation_id
		WHERE cm1.user_id = $1
			AND cm2.user_id != $1
	`, userID)
	if err != nil {
		return nil, err
	}

	defer rows.Close()

	var ids []string

	for rows.Next() {
		var id string

		err := rows.Scan(&id)
		if err != nil {
			return nil, err
		}

		ids = append(ids, id)
	}

	return ids, rows.Err()
}
