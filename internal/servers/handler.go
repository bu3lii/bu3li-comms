package servers

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"mime"
	"net/http"

	"github.com/bu3lii/bu3li-comms/internal/realtime"
	"github.com/bu3lii/bu3li-comms/internal/session"
	"github.com/jackc/pgx/v5"
)

// maxServerImageBytes caps an uploaded server icon/banner; the client is
// expected to downscale before upload, this is just a hard backstop.
const maxServerImageBytes = 6 << 20

var allowedServerImageMimeTypes = map[string]bool{
	"image/png":  true,
	"image/jpeg": true,
	"image/webp": true,
	"image/gif":  true,
}

func isAllowedServerImageMimeType(contentType string) bool {
	base, _, err := mime.ParseMediaType(contentType)
	if err != nil {
		return false
	}
	return allowedServerImageMimeTypes[base]
}

type Handler struct {
	service *Service
	hub     *realtime.Hub
}

func NewHandler(service *Service, hub *realtime.Hub) *Handler {
	return &Handler{service: service, hub: hub}
}

type createServerRequest struct {
	Name string `json:"name"`
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	userID, ok := session.UserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req createServerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.Name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}

	summary, err := h.service.Create(r.Context(), req.Name, userID)
	if err != nil {
		log.Printf("create server error: %v", err)
		http.Error(w, "failed to create server", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(summary)
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := session.UserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	summaries, err := h.service.ListForUser(r.Context(), userID)
	if err != nil {
		log.Printf("list servers error: %v", err)
		http.Error(w, "failed to load servers", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(summaries)
}

func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	userID, ok := session.UserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	serverID := r.PathValue("id")

	summary, err := h.service.Get(r.Context(), serverID, userID)
	if err != nil {
		http.Error(w, "server not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(summary)
}

type updateServerRequest struct {
	Name string `json:"name"`
}

// Update edits server settings (currently just the name) — requires the
// ManageServer permission (or owner, or a role with the admin toggle).
func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	userID, ok := session.UserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	serverID := r.PathValue("id")

	permissions, err := h.service.Permissions(r.Context(), serverID, userID)
	if err != nil || !permissions.ManageServer {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	var req updateServerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.Name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}

	if _, err := h.service.UpdateName(r.Context(), serverID, req.Name); err != nil {
		log.Printf("update server error: %v", err)
		http.Error(w, "failed to update server", http.StatusInternalServerError)
		return
	}

	summary, err := h.service.Get(r.Context(), serverID, userID)
	if err != nil {
		http.Error(w, "failed to load server", http.StatusInternalServerError)
		return
	}

	h.broadcastToServer(r, serverID, realtime.Event{Type: "server.updated", Data: map[string]string{"server_id": serverID}})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(summary)
}

type addMemberRequest struct {
	UserID string `json:"user_id"`
}

// AddMember lets any current server member invite another user by id —
// reusing the existing username-search flow the client already has for
// starting conversations — matching a Discord-style "any member can
// invite" default rather than gating invites to a specific permission.
func (h *Handler) AddMember(w http.ResponseWriter, r *http.Request) {
	userID, ok := session.UserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	serverID := r.PathValue("id")

	if _, err := h.service.Permissions(r.Context(), serverID, userID); err != nil {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	var req addMemberRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.UserID == "" {
		http.Error(w, "user_id is required", http.StatusBadRequest)
		return
	}

	if err := h.service.AddMember(r.Context(), serverID, req.UserID); err != nil {
		log.Printf("add server member error: %v", err)
		http.Error(w, "failed to add member", http.StatusInternalServerError)
		return
	}

	h.broadcastToServer(r, serverID, realtime.Event{
		Type: "server.member_added",
		Data: map[string]string{"server_id": serverID, "user_id": req.UserID},
	})

	w.WriteHeader(http.StatusNoContent)
}

// RemoveMember lets a member with the KickMembers permission (or the
// owner) remove anyone else, or any member remove themselves (leave). The
// owner can't leave/be removed this way — they'd delete the server
// instead, so a server is never left ownerless.
func (h *Handler) RemoveMember(w http.ResponseWriter, r *http.Request) {
	userID, ok := session.UserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	serverID := r.PathValue("id")
	targetUserID := r.PathValue("userID")

	permissions, err := h.service.Permissions(r.Context(), serverID, userID)
	if err != nil {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	if targetUserID != userID && !permissions.KickMembers {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	if targetPermissions, err := h.service.Permissions(r.Context(), serverID, targetUserID); err == nil && targetPermissions.IsOwner {
		http.Error(w, "the owner can't be removed; delete the server instead", http.StatusBadRequest)
		return
	}

	if err := h.service.RemoveMember(r.Context(), serverID, targetUserID); err != nil {
		log.Printf("remove server member error: %v", err)
		http.Error(w, "failed to remove member", http.StatusInternalServerError)
		return
	}

	event := realtime.Event{
		Type: "server.member_removed",
		Data: map[string]string{"server_id": serverID, "user_id": targetUserID},
	}
	h.broadcastToServer(r, serverID, event)
	// The removed member is no longer in server_members, so the broadcast
	// above (which reads current members) never reaches them — tell them
	// directly so their own client drops the server too.
	h.hub.SendToUser(r.Context(), targetUserID, event)

	w.WriteHeader(http.StatusNoContent)
}

type assignRoleRequest struct {
	RoleID string `json:"role_id"`
}

// AssignRole changes a member's role — requires ManageRoles (or owner).
func (h *Handler) AssignRole(w http.ResponseWriter, r *http.Request) {
	userID, ok := session.UserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	serverID := r.PathValue("id")
	targetUserID := r.PathValue("userID")

	permissions, err := h.service.Permissions(r.Context(), serverID, userID)
	if err != nil || !permissions.ManageRoles {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	var req assignRoleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.RoleID == "" {
		http.Error(w, "role_id is required", http.StatusBadRequest)
		return
	}

	if err := h.service.AssignRole(r.Context(), serverID, targetUserID, req.RoleID); err != nil {
		if errors.Is(err, ErrRoleNotFound) {
			http.Error(w, "role not found", http.StatusNotFound)
			return
		}
		log.Printf("assign role error: %v", err)
		http.Error(w, "failed to assign role", http.StatusInternalServerError)
		return
	}

	h.broadcastToServer(r, serverID, realtime.Event{
		Type: "server.member_role_changed",
		Data: map[string]string{"server_id": serverID, "user_id": targetUserID},
	})

	w.WriteHeader(http.StatusNoContent)
}

type roleRequest struct {
	Name              string `json:"name"`
	Color             string `json:"color"`
	IsAdmin           bool   `json:"is_admin"`
	CanManageServer   bool   `json:"can_manage_server"`
	CanManageRoles    bool   `json:"can_manage_roles"`
	CanManageChannels bool   `json:"can_manage_channels"`
	CanKickMembers    bool   `json:"can_kick_members"`
}

func (req roleRequest) toInput() RoleInput {
	return RoleInput{
		Name: req.Name, Color: req.Color, IsAdmin: req.IsAdmin,
		CanManageServer: req.CanManageServer, CanManageRoles: req.CanManageRoles,
		CanManageChannels: req.CanManageChannels, CanKickMembers: req.CanKickMembers,
	}
}

func (h *Handler) CreateRole(w http.ResponseWriter, r *http.Request) {
	userID, ok := session.UserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	serverID := r.PathValue("id")

	permissions, err := h.service.Permissions(r.Context(), serverID, userID)
	if err != nil || !permissions.ManageRoles {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	var req roleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.Name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	if req.Color == "" {
		req.Color = "#9298A6"
	}

	role, err := h.service.CreateRole(r.Context(), serverID, req.toInput())
	if err != nil {
		log.Printf("create role error: %v", err)
		http.Error(w, "failed to create role", http.StatusInternalServerError)
		return
	}

	h.broadcastToServer(r, serverID, realtime.Event{Type: "server.role_changed", Data: map[string]string{"server_id": serverID}})

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(role)
}

func (h *Handler) UpdateRole(w http.ResponseWriter, r *http.Request) {
	userID, ok := session.UserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	serverID := r.PathValue("id")
	roleID := r.PathValue("roleID")

	permissions, err := h.service.Permissions(r.Context(), serverID, userID)
	if err != nil || !permissions.ManageRoles {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	var req roleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.Name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	if req.Color == "" {
		req.Color = "#9298A6"
	}

	role, err := h.service.UpdateRole(r.Context(), serverID, roleID, req.toInput())
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "role not found", http.StatusNotFound)
			return
		}
		log.Printf("update role error: %v", err)
		http.Error(w, "failed to update role", http.StatusInternalServerError)
		return
	}

	h.broadcastToServer(r, serverID, realtime.Event{Type: "server.role_changed", Data: map[string]string{"server_id": serverID}})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(role)
}

func (h *Handler) DeleteRole(w http.ResponseWriter, r *http.Request) {
	userID, ok := session.UserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	serverID := r.PathValue("id")
	roleID := r.PathValue("roleID")

	permissions, err := h.service.Permissions(r.Context(), serverID, userID)
	if err != nil || !permissions.ManageRoles {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	if err := h.service.DeleteRole(r.Context(), serverID, roleID); err != nil {
		if errors.Is(err, ErrDefaultRole) {
			http.Error(w, "the default role can't be deleted", http.StatusBadRequest)
			return
		}
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "role not found", http.StatusNotFound)
			return
		}
		log.Printf("delete role error: %v", err)
		http.Error(w, "failed to delete role", http.StatusInternalServerError)
		return
	}

	h.broadcastToServer(r, serverID, realtime.Event{Type: "server.role_changed", Data: map[string]string{"server_id": serverID}})

	w.WriteHeader(http.StatusNoContent)
}

type createChannelRequest struct {
	Name string `json:"name"`
	Type string `json:"type"`
}

func (h *Handler) CreateChannel(w http.ResponseWriter, r *http.Request) {
	userID, ok := session.UserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	serverID := r.PathValue("id")

	permissions, err := h.service.Permissions(r.Context(), serverID, userID)
	if err != nil || !permissions.ManageChannels {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	var req createChannelRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.Name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	if req.Type != "text" && req.Type != "voice" {
		http.Error(w, "type must be 'text' or 'voice'", http.StatusBadRequest)
		return
	}

	channel, err := h.service.CreateChannel(r.Context(), serverID, req.Name, req.Type)
	if err != nil {
		log.Printf("create channel error: %v", err)
		http.Error(w, "failed to create channel", http.StatusInternalServerError)
		return
	}

	h.broadcastToServer(r, serverID, realtime.Event{Type: "server.channel_created", Data: channel})

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(channel)
}

type reorderChannelsRequest struct {
	ChannelIDs []string `json:"channel_ids"`
}

// ReorderChannels sets the server's full channel order in one call — the
// client sends the complete new ordering after a drag-and-drop, rather
// than one request per moved channel.
func (h *Handler) ReorderChannels(w http.ResponseWriter, r *http.Request) {
	userID, ok := session.UserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	serverID := r.PathValue("id")

	permissions, err := h.service.Permissions(r.Context(), serverID, userID)
	if err != nil || !permissions.ManageChannels {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	var req reorderChannelsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if len(req.ChannelIDs) == 0 {
		http.Error(w, "channel_ids is required", http.StatusBadRequest)
		return
	}

	if err := h.service.ReorderChannels(r.Context(), serverID, req.ChannelIDs); err != nil {
		if errors.Is(err, ErrChannelNotFound) {
			http.Error(w, "one or more channels not found in this server", http.StatusBadRequest)
			return
		}
		log.Printf("reorder channels error: %v", err)
		http.Error(w, "failed to reorder channels", http.StatusInternalServerError)
		return
	}

	h.broadcastToServer(r, serverID, realtime.Event{
		Type: "server.channels_reordered",
		Data: map[string]string{"server_id": serverID},
	})

	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) DeleteChannel(w http.ResponseWriter, r *http.Request) {
	userID, ok := session.UserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	serverID := r.PathValue("id")
	channelID := r.PathValue("channelID")

	permissions, err := h.service.Permissions(r.Context(), serverID, userID)
	if err != nil || !permissions.ManageChannels {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	if err := h.service.DeleteChannel(r.Context(), serverID, channelID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "channel not found", http.StatusNotFound)
			return
		}
		log.Printf("delete channel error: %v", err)
		http.Error(w, "failed to delete channel", http.StatusInternalServerError)
		return
	}

	h.broadcastToServer(r, serverID, realtime.Event{
		Type: "server.channel_deleted",
		Data: map[string]string{"server_id": serverID, "channel_id": channelID},
	})

	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) DeleteServer(w http.ResponseWriter, r *http.Request) {
	userID, ok := session.UserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	serverID := r.PathValue("id")

	permissions, err := h.service.Permissions(r.Context(), serverID, userID)
	if err != nil || !permissions.IsOwner {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	memberIDs, err := h.service.ListMemberIDs(r.Context(), serverID)
	if err != nil {
		http.Error(w, "failed to load server members", http.StatusInternalServerError)
		return
	}

	if err := h.service.DeleteServer(r.Context(), serverID); err != nil {
		log.Printf("delete server error: %v", err)
		http.Error(w, "failed to delete server", http.StatusInternalServerError)
		return
	}

	event := realtime.Event{Type: "server.deleted", Data: map[string]string{"server_id": serverID}}
	for _, memberID := range memberIDs {
		h.hub.SendToUser(r.Context(), memberID, event)
	}

	w.WriteHeader(http.StatusNoContent)
}

// uploadServerImage is shared by the icon/banner upload handlers below —
// they differ only in which service method stores the bytes and which
// realtime event they broadcast.
func (h *Handler) uploadServerImage(w http.ResponseWriter, r *http.Request, store func(mimeType string, data []byte) error, eventType string) {
	userID, ok := session.UserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	serverID := r.PathValue("id")

	permissions, err := h.service.Permissions(r.Context(), serverID, userID)
	if err != nil || !permissions.ManageServer {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	mimeType := r.Header.Get("Content-Type")
	if !isAllowedServerImageMimeType(mimeType) {
		http.Error(w, "unsupported image content type", http.StatusUnsupportedMediaType)
		return
	}

	data, err := io.ReadAll(io.LimitReader(r.Body, maxServerImageBytes+1))
	if err != nil {
		http.Error(w, "failed to read image", http.StatusInternalServerError)
		return
	}
	if len(data) == 0 {
		http.Error(w, "image is empty", http.StatusBadRequest)
		return
	}
	if len(data) > maxServerImageBytes {
		http.Error(w, "image too large", http.StatusRequestEntityTooLarge)
		return
	}

	if err := store(mimeType, data); err != nil {
		log.Printf("upload server image error: %v", err)
		http.Error(w, "failed to save image", http.StatusInternalServerError)
		return
	}

	h.broadcastToServer(r, serverID, realtime.Event{Type: eventType, Data: map[string]string{"server_id": serverID}})

	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) UploadIcon(w http.ResponseWriter, r *http.Request) {
	serverID := r.PathValue("id")
	h.uploadServerImage(w, r, func(mimeType string, data []byte) error {
		return h.service.UpsertIcon(r.Context(), serverID, mimeType, data)
	}, "server.updated")
}

func (h *Handler) UploadBanner(w http.ResponseWriter, r *http.Request) {
	serverID := r.PathValue("id")
	h.uploadServerImage(w, r, func(mimeType string, data []byte) error {
		return h.service.UpsertBanner(r.Context(), serverID, mimeType, data)
	}, "server.updated")
}

func (h *Handler) DeleteIcon(w http.ResponseWriter, r *http.Request) {
	h.deleteServerImage(w, r, h.service.DeleteIcon, "server.updated")
}

func (h *Handler) DeleteBanner(w http.ResponseWriter, r *http.Request) {
	h.deleteServerImage(w, r, h.service.DeleteBanner, "server.updated")
}

func (h *Handler) deleteServerImage(w http.ResponseWriter, r *http.Request, remove func(ctx context.Context, serverID string) error, eventType string) {
	userID, ok := session.UserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	serverID := r.PathValue("id")

	permissions, err := h.service.Permissions(r.Context(), serverID, userID)
	if err != nil || !permissions.ManageServer {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	if err := remove(r.Context(), serverID); err != nil {
		log.Printf("delete server image error: %v", err)
		http.Error(w, "failed to delete image", http.StatusInternalServerError)
		return
	}

	h.broadcastToServer(r, serverID, realtime.Event{Type: eventType, Data: map[string]string{"server_id": serverID}})

	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) getServerImage(w http.ResponseWriter, r *http.Request, get func() (Attachment, error)) {
	userID, ok := session.UserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	serverID := r.PathValue("id")

	if _, err := h.service.Permissions(r.Context(), serverID, userID); err != nil {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	attachment, err := get()
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", attachment.MimeType)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; sandbox")
	w.Header().Set("Content-Disposition", `inline; filename="image"`)
	w.Header().Set("Cache-Control", "private, max-age=300")
	w.Write(attachment.Data)
}

func (h *Handler) GetIcon(w http.ResponseWriter, r *http.Request) {
	serverID := r.PathValue("id")
	h.getServerImage(w, r, func() (Attachment, error) { return h.service.GetIcon(r.Context(), serverID) })
}

func (h *Handler) GetBanner(w http.ResponseWriter, r *http.Request) {
	serverID := r.PathValue("id")
	h.getServerImage(w, r, func() (Attachment, error) { return h.service.GetBanner(r.Context(), serverID) })
}

func (h *Handler) broadcastToServer(r *http.Request, serverID string, event realtime.Event) {
	memberIDs, err := h.service.ListMemberIDs(r.Context(), serverID)
	if err != nil {
		log.Printf("list server members for broadcast: %v", err)
		return
	}
	for _, memberID := range memberIDs {
		h.hub.SendToUser(r.Context(), memberID, event)
	}
}
