package conversations

import (
	"encoding/json"
	"net/http"

	"github.com/bu3lii/bu3li-comms/internal/auth"
)

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

type createConversationRequest struct {
	Type string `json:"type"`
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
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
	currentUserID, ok := auth.UserIDFromContext(r.Context())
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

	w.WriteHeader(http.StatusNoContent)
}
