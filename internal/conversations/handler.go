package conversations

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/bu3lii/bu3li-comms/internal/session"
)

// MembershipNotifier lets something outside this package (realtime, which
// already owns the Hub and presence.Service) react when a new member joins
// a conversation. Presence otherwise only updates on connect/disconnect, so
// without this, two already-connected users who just started a
// conversation together would show each other as offline until one of them
// reconnects — see BACKEND_GAPS.md.
type MembershipNotifier interface {
	NotifyMembershipAdded(ctx context.Context, conversationID string, newUserID string)
}

type Handler struct {
	service  *Service
	notifier MembershipNotifier
}

func NewHandler(service *Service, notifier MembershipNotifier) *Handler {
	return &Handler{service: service, notifier: notifier}
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := session.UserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	summaries, err := h.service.ListForUser(r.Context(), userID)
	if err != nil {
		http.Error(w, "failed to load conversations", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(summaries)
}

type createConversationRequest struct {
	Type string `json:"type"`
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	userID, ok := session.UserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req createConversationRequest

	err := json.NewDecoder(r.Body).Decode(&req)
	if err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.Type != "direct" && req.Type != "group" {
		http.Error(w, "invalid conversation type", http.StatusBadRequest)
		return
	}

	conversation, err := h.service.Create(r.Context(), req.Type, userID)
	if err != nil {
		http.Error(w, "failed to create conversation", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)

	json.NewEncoder(w).Encode(conversation)
}

type addMemberRequest struct {
	UserID string `json:"user_id"`
}

func (h *Handler) AddMember(w http.ResponseWriter, r *http.Request) {
	currentUserID, ok := session.UserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	conversationID := r.PathValue("id")

	isMember, err := h.service.IsMember(r.Context(), conversationID, currentUserID)
	if err != nil {
		http.Error(w, "failed to check membership", http.StatusInternalServerError)
		return
	}

	if !isMember {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	var req addMemberRequest

	err = json.NewDecoder(r.Body).Decode(&req)
	if err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.UserID == "" {
		http.Error(w, "user_id is required", http.StatusBadRequest)
		return
	}

	err = h.service.AddMember(r.Context(), conversationID, req.UserID)
	if err != nil {
		http.Error(w, "failed to add member", http.StatusInternalServerError)
		return
	}

	if h.notifier != nil {
		h.notifier.NotifyMembershipAdded(r.Context(), conversationID, req.UserID)
	}

	w.WriteHeader(http.StatusNoContent)
}
