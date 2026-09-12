package auth

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/bu3lii/bu3li-comms/internal/ratelimit"
	"github.com/bu3lii/bu3li-comms/internal/security"
	"github.com/bu3lii/bu3li-comms/internal/session"
	"github.com/bu3lii/bu3li-comms/internal/users"
)

// loginAttemptLimit/loginAttemptWindow throttle credential guessing per
// source IP. Deliberately generous enough not to lock out someone who
// mistypes their password a couple of times.
const (
	loginAttemptLimit  = 10
	loginAttemptWindow = 5 * time.Minute
)

type Handler struct {
	users    *users.Service
	sessions *session.Service
	limiter  *ratelimit.Limiter
}

func NewHandler(userService *users.Service, sessionService *session.Service, limiter *ratelimit.Limiter) *Handler {
	return &Handler{
		users:    userService,
		sessions: sessionService,
		limiter:  limiter,
	}
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	if !h.limiter.Allow(r.Context(), "ratelimit:login:"+ratelimit.ClientIP(r), loginAttemptLimit, loginAttemptWindow) {
		http.Error(w, "too many login attempts, try again later", http.StatusTooManyRequests)
		return
	}

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
	json.NewEncoder(w).Encode(map[string]any{
		"id":         user.ID,
		"username":   user.Username,
		"email":      user.Email,
		"has_avatar": user.HasAvatar,
		"created_at": user.CreatedAt,
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
