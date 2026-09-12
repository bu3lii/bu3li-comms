package auth

import (
	"encoding/json"
	"net/http"

	"github.com/bu3lii/bu3li-comms/internal/security"
	"github.com/bu3lii/bu3li-comms/internal/session"
	"github.com/bu3lii/bu3li-comms/internal/users"
)

type Handler struct {
	users    *users.Service
	sessions *session.Service
}

func NewHandler(userService *users.Service, sessionService *session.Service) *Handler {
	return &Handler{
		users:    userService,
		sessions: sessionService,
	}
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest

	err := json.NewDecoder(r.Body).Decode(&req)
	if err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	user, err := h.users.GetByEmail(r.Context(), req.Email)
	if err != nil {
		http.Error(w, "invalid email or password", http.StatusUnauthorized)
		return
	}

	err = security.CheckPassword(req.Password, user.PasswordHash)
	if err != nil {
		http.Error(w, "invalid email or password", http.StatusUnauthorized)
		return
	}

	err = h.sessions.IssueCookie(r.Context(), w, user.ID)
	if err != nil {
		http.Error(w, "failed to create session", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"id":       user.ID,
		"username": user.Username,
		"email":    user.Email,
	})
}

func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {

	userID, ok := session.UserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	user, err := h.users.GetByID(r.Context(), userID)
	if err != nil {
		http.Error(w, "failed to load user", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(user)
}

func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	h.sessions.ClearCookie(r.Context(), w, r)
	w.WriteHeader(http.StatusNoContent)
}
