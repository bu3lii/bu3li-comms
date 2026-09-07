package auth

import (
	"encoding/json"
	"net/http"

	"github.com/bu3lii/bu3li-comms/internal/security"
	"github.com/bu3lii/bu3li-comms/internal/users"
)

type Handler struct {
	users    *users.Service
	sessions *SessionService
}

func NewHandler(userService *users.Service, sessionService *SessionService) *Handler {
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

	sessionID, err := h.sessions.Create(r.Context(), user.ID)
	if err != nil {
		http.Error(w, "failed to create session", http.StatusInternalServerError)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "session_id",
		Value:    sessionID,
		Path:     "/",
		HttpOnly: true,
		Secure:   false,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(SessionTTL.Seconds()),
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"id":       user.ID,
		"username": user.Username,
		"email":    user.Email,
	})
}

func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	cookie,err := r.Cookie("session_id")
	if err != nil {
		http.Error(w,"unauthorized",http.StatusUnauthorized)
		return
	}

	userID, err := h.sessions.GetUserID(r.Context(),cookie.Value)
	if err != nil {
		http.Error(w,"unauthorized",http.StatusUnauthorized)
		return
	}

	user,err := h.users.GetByID(r.Context(),userID)
	if err != nil {
		http.Error(w,"unauthorized",http.StatusUnauthorized)
		return
	}

	w.Header().Set("Content-Type","application/json")
	json.NewEncoder(w).Encode(user)
}

func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	cookie,err := r.Cookie("session_id")
	if err == nil {
		_ = h.sessions.Delete(r.Context(),cookie.Value)
	}

	http.SetCookie(w,&http.Cookie{
		Name: "session_id",
		Value: "",
		Path: "/",
		HttpOnly: true,
		Secure: false,
		SameSite: http.SameSiteLaxMode,
		MaxAge: -1,
	})

	w.WriteHeader(http.StatusNoContent)
}