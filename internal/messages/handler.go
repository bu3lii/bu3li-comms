package messages

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"github.com/bu3lii/bu3li-comms/internal/auth"
	"github.com/bu3lii/bu3li-comms/internal/conversations"
	"github.com/bu3lii/bu3li-comms/internal/realtime"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

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
	userID, ok := auth.UserIDFromContext(r.Context())
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

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
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
	userID, ok := auth.UserIDFromContext(r.Context())
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

		log.Printf("failed to update: %v",err)
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
	userID, ok := auth.UserIDFromContext(r.Context())
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
