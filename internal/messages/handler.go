package messages

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"mime"
	"net/http"
	"strconv"
	"time"

	"github.com/bu3lii/bu3li-comms/internal/conversations"
	"github.com/bu3lii/bu3li-comms/internal/ratelimit"
	"github.com/bu3lii/bu3li-comms/internal/realtime"
	"github.com/bu3lii/bu3li-comms/internal/session"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// maxVoiceMessageBytes caps an uploaded voice note (~10 minutes of Opus at
// typical bitrates) so a client can't stream unbounded data into Postgres.
const maxVoiceMessageBytes = 10 << 20

// maxImageBytes/maxVideoBytes cap uploaded picture/video attachments. The
// client is expected to downscale images and cap recording duration before
// upload; these are hard backstops, not the primary UX limit.
const (
	maxImageBytes = 8 << 20
	maxVideoBytes = 50 << 20
)

// sendLimit/sendWindow throttle how fast one user can post messages
// (text, voice, or media) — generous enough for normal typing/sending
// bursts, tight enough to blunt a scripted flood.
const (
	sendLimit  = 20
	sendWindow = 10 * time.Second
)

// allowedVoiceMimeTypes restricts uploads to actual audio formats. Without
// this, a client could set Content-Type to e.g. text/html and have it
// served back verbatim on download — stored XSS on this origin for anyone
// who opens the attachment URL directly rather than through the <audio>
// player.
var allowedVoiceMimeTypes = map[string]bool{
	"audio/webm": true,
	"audio/ogg":  true,
	"audio/mp4":  true,
	"audio/mpeg": true,
	"audio/wav":  true,
}

// allowedImageMimeTypes/allowedVideoMimeTypes are the same defense for
// picture and video attachments, generalizing the voice upload path per
// ROADMAP.md's near-term "picture/video attachments" item.
var allowedImageMimeTypes = map[string]bool{
	"image/png":  true,
	"image/jpeg": true,
	"image/webp": true,
	"image/gif":  true,
}

var allowedVideoMimeTypes = map[string]bool{
	"video/webm": true,
	"video/mp4":  true,
}

func isAllowedVoiceMimeType(contentType string) bool {
	base, _, err := mime.ParseMediaType(contentType)
	if err != nil {
		return false
	}
	return allowedVoiceMimeTypes[base]
}

// mediaKindFor validates contentType against the image/video allowlists and
// reports which kind it matched, for a single generic media-upload handler.
func mediaKindFor(contentType string) (kind string, ok bool) {
	base, _, err := mime.ParseMediaType(contentType)
	if err != nil {
		return "", false
	}
	if allowedImageMimeTypes[base] {
		return "image", true
	}
	if allowedVideoMimeTypes[base] {
		return "video", true
	}
	return "", false
}

type Handler struct {
	service       *Service
	conversations *conversations.Service
	hub           *realtime.Hub
	limiter       *ratelimit.Limiter
}

func NewHandler(service *Service, conversationService *conversations.Service, hub *realtime.Hub, limiter *ratelimit.Limiter) *Handler {
	return &Handler{
		service:       service,
		conversations: conversationService,
		hub:           hub,
		limiter:       limiter,
	}
}

type createMessageRequest struct {
	ClientMessageID string `json:"client_message_id"`
	Content         string `json:"content"`
}

type editMessageRequest struct {
	Content string `json:"content"`
	Version int    `json:"version"`
}

func (h *Handler) rateLimited(w http.ResponseWriter, r *http.Request, userID string) bool {
	if h.limiter.Allow(r.Context(), "ratelimit:send:"+userID, sendLimit, sendWindow) {
		return false
	}
	http.Error(w, "sending too fast, slow down", http.StatusTooManyRequests)
	return true
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	userID, ok := session.UserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	if h.rateLimited(w, r, userID) {
		return
	}

	conversationID := r.PathValue("id")

	isMember, err := h.conversations.IsMember(r.Context(), conversationID, userID)
	if err != nil {
		http.Error(w, "failed to check membership", http.StatusInternalServerError)
		return
	}

	if !isMember {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	var req createMessageRequest

	err = json.NewDecoder(r.Body).Decode(&req)
	if err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.Content == "" {
		http.Error(w, "content is required", http.StatusBadRequest)
		return
	}

	_, err = uuid.Parse(req.ClientMessageID)
	if err != nil {
		http.Error(w, "client_message_id must be a valid uuid", http.StatusBadRequest)
		return
	}

	message, err := h.service.Create(r.Context(), conversationID, userID, req.ClientMessageID, req.Content)
	if err != nil {
		log.Printf("create message error: %v", err)
		http.Error(w, "failed to create message", http.StatusInternalServerError)
		return
	}

	h.broadcastToMembers(r, conversationID, realtime.Event{Type: "message.created", Data: message})

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(message)
}

func (h *Handler) CreateVoice(w http.ResponseWriter, r *http.Request) {
	userID, ok := session.UserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	if h.rateLimited(w, r, userID) {
		return
	}

	conversationID := r.PathValue("id")

	isMember, err := h.conversations.IsMember(r.Context(), conversationID, userID)
	if err != nil {
		http.Error(w, "failed to check membership", http.StatusInternalServerError)
		return
	}
	if !isMember {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	clientMessageID := r.URL.Query().Get("client_message_id")
	if _, err := uuid.Parse(clientMessageID); err != nil {
		http.Error(w, "client_message_id must be a valid uuid", http.StatusBadRequest)
		return
	}

	durationMs, err := strconv.Atoi(r.URL.Query().Get("duration_ms"))
	if err != nil || durationMs <= 0 {
		http.Error(w, "duration_ms must be a positive integer", http.StatusBadRequest)
		return
	}

	mimeType := r.Header.Get("Content-Type")
	if mimeType == "" {
		mimeType = "audio/webm"
	}
	if !isAllowedVoiceMimeType(mimeType) {
		http.Error(w, "unsupported audio content type", http.StatusUnsupportedMediaType)
		return
	}

	data, err := io.ReadAll(io.LimitReader(r.Body, maxVoiceMessageBytes+1))
	if err != nil {
		http.Error(w, "failed to read audio", http.StatusInternalServerError)
		return
	}
	if len(data) == 0 {
		http.Error(w, "audio is empty", http.StatusBadRequest)
		return
	}
	if len(data) > maxVoiceMessageBytes {
		http.Error(w, "audio too large", http.StatusRequestEntityTooLarge)
		return
	}

	message, err := h.service.CreateVoice(r.Context(), conversationID, userID, clientMessageID, mimeType, durationMs, data)
	if err != nil {
		log.Printf("create voice message error: %v", err)
		http.Error(w, "failed to create voice message", http.StatusInternalServerError)
		return
	}

	h.broadcastToMembers(r, conversationID, realtime.Event{Type: "message.created", Data: message})

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(message)
}

// CreateMedia stores a picture or video attachment — the same idempotent
// upload shape as CreateVoice, generalized to the image/video allowlists.
func (h *Handler) CreateMedia(w http.ResponseWriter, r *http.Request) {
	userID, ok := session.UserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	if h.rateLimited(w, r, userID) {
		return
	}

	conversationID := r.PathValue("id")

	isMember, err := h.conversations.IsMember(r.Context(), conversationID, userID)
	if err != nil {
		http.Error(w, "failed to check membership", http.StatusInternalServerError)
		return
	}
	if !isMember {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	clientMessageID := r.URL.Query().Get("client_message_id")
	if _, err := uuid.Parse(clientMessageID); err != nil {
		http.Error(w, "client_message_id must be a valid uuid", http.StatusBadRequest)
		return
	}

	mimeType := r.Header.Get("Content-Type")
	kind, ok := mediaKindFor(mimeType)
	if !ok {
		http.Error(w, "unsupported media content type", http.StatusUnsupportedMediaType)
		return
	}

	// duration_ms is required for video, meaningless (and optional) for a
	// still image.
	durationMs := 0
	if kind == "video" {
		durationMs, err = strconv.Atoi(r.URL.Query().Get("duration_ms"))
		if err != nil || durationMs <= 0 {
			http.Error(w, "duration_ms must be a positive integer for video", http.StatusBadRequest)
			return
		}
	}

	widthPx, _ := strconv.Atoi(r.URL.Query().Get("width_px"))
	heightPx, _ := strconv.Atoi(r.URL.Query().Get("height_px"))

	maxBytes := int64(maxImageBytes)
	if kind == "video" {
		maxBytes = maxVideoBytes
	}

	data, err := io.ReadAll(io.LimitReader(r.Body, maxBytes+1))
	if err != nil {
		http.Error(w, "failed to read media", http.StatusInternalServerError)
		return
	}
	if len(data) == 0 {
		http.Error(w, "media is empty", http.StatusBadRequest)
		return
	}
	if int64(len(data)) > maxBytes {
		http.Error(w, "media too large", http.StatusRequestEntityTooLarge)
		return
	}

	message, err := h.service.CreateMedia(r.Context(), conversationID, userID, clientMessageID, mimeType, durationMs, widthPx, heightPx, data)
	if err != nil {
		log.Printf("create media message error: %v", err)
		http.Error(w, "failed to create media message", http.StatusInternalServerError)
		return
	}

	h.broadcastToMembers(r, conversationID, realtime.Event{Type: "message.created", Data: message})

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(message)
}

func (h *Handler) GetAttachment(w http.ResponseWriter, r *http.Request) {
	userID, ok := session.UserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	messageID := r.PathValue("messageID")

	conversationID, err := h.service.GetConversationID(r.Context(), messageID)
	if err != nil {
		http.Error(w, "message not found", http.StatusNotFound)
		return
	}

	isMember, err := h.conversations.IsMember(r.Context(), conversationID, userID)
	if err != nil {
		http.Error(w, "failed to check membership", http.StatusInternalServerError)
		return
	}
	if !isMember {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	attachment, err := h.service.GetAttachment(r.Context(), messageID)
	if err != nil {
		http.Error(w, "attachment not found", http.StatusNotFound)
		return
	}

	// Upload already restricts MimeType to an allowlist (audio/image/video),
	// so this can never render as HTML/script — nosniff and a locked-down
	// CSP are defense-in-depth for anyone who navigates to the URL directly
	// rather than loading it through the <audio>/<img>/<video> element.
	w.Header().Set("Content-Type", attachment.MimeType)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; sandbox")
	w.Header().Set("Content-Disposition", `inline; filename="attachment"`)
	w.Header().Set("Cache-Control", "private, max-age=31536000, immutable")
	w.Write(attachment.Data)
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := session.UserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	conversationID := r.PathValue("id")

	isMember, err := h.conversations.IsMember(r.Context(), conversationID, userID)
	if err != nil {
		http.Error(w, "failed to check membership", http.StatusInternalServerError)
		return
	}

	if !isMember {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	list, err := h.service.ListByConversation(r.Context(), conversationID)
	if err != nil {
		http.Error(w, "failed to load messages", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(list)
}

func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	userID, ok := session.UserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	messageID := r.PathValue("messageID")

	var req editMessageRequest

	err := json.NewDecoder(r.Body).Decode(&req)
	if err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.Content == "" {
		http.Error(w, "content is required", http.StatusBadRequest)
		return
	}

	if req.Version < 1 {
		http.Error(w, "version must be >= 1", http.StatusBadRequest)
		return
	}

	message, err := h.service.Update(r.Context(), messageID, userID, req.Version, req.Content)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "message changed or cannot be edited", http.StatusConflict)
			return
		}

		log.Printf("failed to update: %v", err)
		http.Error(w, "failed to update message", http.StatusInternalServerError)
		return
	}

	h.broadcastToMembers(r, message.ConversationID, realtime.Event{Type: "message.updated", Data: message})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(message)
}

func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	userID, ok := session.UserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	messageID := r.PathValue("messageID")

	message, err := h.service.Delete(r.Context(), messageID, userID)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "message not found or cannot be deleted", http.StatusNotFound)
			return
		}

		log.Printf("update message error: %v", err)
		http.Error(w, "failed to delete message", http.StatusInternalServerError)
		return
	}

	h.broadcastToMembers(r, message.ConversationID, realtime.Event{
		Type: "message.deleted",
		Data: map[string]string{
			"message_id":      message.ID,
			"conversation_id": message.ConversationID,
		},
	})

	w.WriteHeader(http.StatusNoContent)
}

type reactionRequest struct {
	Emoji string `json:"emoji"`
}

// AddReaction records the caller's emoji reaction to a message and
// broadcasts it to every conversation member, mirroring the
// message.created/updated realtime pattern.
func (h *Handler) AddReaction(w http.ResponseWriter, r *http.Request) {
	userID, ok := session.UserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	messageID := r.PathValue("messageID")

	var req reactionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if !isAllowedReactionEmoji(req.Emoji) {
		http.Error(w, "unsupported reaction", http.StatusBadRequest)
		return
	}

	conversationID, ok := h.requireMessageMembership(w, r, messageID, userID)
	if !ok {
		return
	}

	if err := h.service.AddReaction(r.Context(), messageID, userID, req.Emoji); err != nil {
		log.Printf("add reaction error: %v", err)
		http.Error(w, "failed to add reaction", http.StatusInternalServerError)
		return
	}

	h.broadcastToMembers(r, conversationID, realtime.Event{
		Type: "message.reaction_added",
		Data: map[string]string{
			"message_id":      messageID,
			"conversation_id": conversationID,
			"user_id":         userID,
			"emoji":           req.Emoji,
		},
	})

	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) RemoveReaction(w http.ResponseWriter, r *http.Request) {
	userID, ok := session.UserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	messageID := r.PathValue("messageID")
	emoji := r.PathValue("emoji")

	if !isAllowedReactionEmoji(emoji) {
		http.Error(w, "unsupported reaction", http.StatusBadRequest)
		return
	}

	conversationID, ok := h.requireMessageMembership(w, r, messageID, userID)
	if !ok {
		return
	}

	if err := h.service.RemoveReaction(r.Context(), messageID, userID, emoji); err != nil {
		log.Printf("remove reaction error: %v", err)
		http.Error(w, "failed to remove reaction", http.StatusInternalServerError)
		return
	}

	h.broadcastToMembers(r, conversationID, realtime.Event{
		Type: "message.reaction_removed",
		Data: map[string]string{
			"message_id":      messageID,
			"conversation_id": conversationID,
			"user_id":         userID,
			"emoji":           emoji,
		},
	})

	w.WriteHeader(http.StatusNoContent)
}

// requireMessageMembership resolves messageID's conversation and checks
// userID belongs to it, writing an error response and returning ok=false if
// not. Shared by the reaction endpoints.
func (h *Handler) requireMessageMembership(w http.ResponseWriter, r *http.Request, messageID string, userID string) (conversationID string, ok bool) {
	conversationID, err := h.service.GetConversationID(r.Context(), messageID)
	if err != nil {
		http.Error(w, "message not found", http.StatusNotFound)
		return "", false
	}

	isMember, err := h.conversations.IsMember(r.Context(), conversationID, userID)
	if err != nil {
		http.Error(w, "failed to check membership", http.StatusInternalServerError)
		return "", false
	}
	if !isMember {
		http.Error(w, "forbidden", http.StatusForbidden)
		return "", false
	}

	return conversationID, true
}

// broadcastToMembers fans an event out to every member of a conversation.
// Logs and swallows a member-list lookup failure rather than failing the
// whole request — the write already succeeded, so the caller's HTTP
// response should still reflect success.
func (h *Handler) broadcastToMembers(r *http.Request, conversationID string, event realtime.Event) {
	memberIDs, err := h.conversations.ListMemberIDs(r.Context(), conversationID)
	if err != nil {
		log.Printf("list conversation members for broadcast: %v", err)
		return
	}

	for _, memberID := range memberIDs {
		h.hub.SendToUser(r.Context(), memberID, event)
	}
}
