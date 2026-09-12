package messages

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"mime"
	"net/http"
	"strconv"

	"github.com/bu3lii/bu3li-comms/internal/conversations"
	"github.com/bu3lii/bu3li-comms/internal/realtime"
	"github.com/bu3lii/bu3li-comms/internal/session"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// maxVoiceMessageBytes caps an uploaded voice note (~10 minutes of Opus at
// typical bitrates) so a client can't stream unbounded data into Postgres.
const maxVoiceMessageBytes = 10 << 20

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

func isAllowedVoiceMimeType(contentType string) bool {
	base, _, err := mime.ParseMediaType(contentType)
	if err != nil {
		return false
	}
	return allowedVoiceMimeTypes[base]
}

type Handler struct {
	service       *Service
	conversations *conversations.Service
	hub           *realtime.Hub
}

func NewHandler(service *Service, conversationService *conversations.Service, hub *realtime.Hub) *Handler {
	return &Handler{
		service:       service,
		conversations: conversationService,
		hub:           hub,
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

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
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

	memberIDs, err := h.conversations.ListMemberIDs(r.Context(), conversationID)
	if err != nil {
		log.Printf("list conversation members: %v", err)
		http.Error(w, "failed to load conversation members", http.StatusInternalServerError)
		return
	}

	event := realtime.Event{
		Type: "message.created",
		Data: message,
	}

	for _, memberID := range memberIDs {
		h.hub.SendToUser(r.Context(), memberID, event)
	}

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

	memberIDs, err := h.conversations.ListMemberIDs(r.Context(), conversationID)
	if err != nil {
		log.Printf("list conversation members: %v", err)
		http.Error(w, "failed to load conversation members", http.StatusInternalServerError)
		return
	}

	event := realtime.Event{Type: "message.created", Data: message}
	for _, memberID := range memberIDs {
		h.hub.SendToUser(r.Context(), memberID, event)
	}

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

	// Upload already restricts MimeType to the audio allowlist, so this can
	// never render as HTML/script — nosniff and a locked-down CSP are
	// defense-in-depth for anyone who navigates to the URL directly rather
	// than loading it through the <audio> player.
	w.Header().Set("Content-Type", attachment.MimeType)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; sandbox")
	w.Header().Set("Content-Disposition", `inline; filename="voice-message"`)
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

	memberIDs, err := h.conversations.ListMemberIDs(r.Context(), message.ConversationID)
	if err != nil {
		http.Error(w, "failed to load conversation members", http.StatusInternalServerError)
		return
	}

	event := realtime.Event{
		Type: "message.updated",
		Data: message,
	}

	for _, memberID := range memberIDs {
		h.hub.SendToUser(r.Context(), memberID, event)
	}

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

	memberIDs, err := h.conversations.ListMemberIDs(r.Context(), message.ConversationID)

	if err != nil {
		http.Error(w, "failed to load conversation members", http.StatusInternalServerError)
		return
	}

	event := realtime.Event{
		Type: "message.deleted",
		Data: map[string]string{
			"message_id":      message.ID,
			"conversation_id": message.ConversationID,
		},
	}

	for _, memberID := range memberIDs {
		h.hub.SendToUser(r.Context(), memberID, event)
	}

	w.WriteHeader(http.StatusNoContent)
}
