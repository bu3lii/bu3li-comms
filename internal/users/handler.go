package users

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"

	"github.com/bu3lii/bu3li-comms/internal/security"
	"github.com/bu3lii/bu3li-comms/internal/session"
	"github.com/jackc/pgx/v5/pgconn"
)

const minPasswordLength = 8

// uniqueConstraintField maps a Postgres unique_violation on the users table
// to which request field caused it, so the client can show a field-level
// error instead of a generic one.
func uniqueConstraintField(err error) string {
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) || pgErr.Code != "23505" {
		return ""
	}
	switch {
	case strings.Contains(pgErr.ConstraintName, "username"):
		return "username"
	case strings.Contains(pgErr.ConstraintName, "email"):
		return "email"
	default:
		return "unknown"
	}
}

type Handler struct {
	service  *Service
	sessions *session.Service
}

func NewHandler(service *Service, sessionService *session.Service) *Handler {
	return &Handler{service: service, sessions: sessionService}
}

type CreateUserRequest struct {
	Username string `json:"username"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	var req CreateUserRequest

	err := json.NewDecoder(r.Body).Decode(&req)
	if err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	hashedPassword, err := security.HashPassword(req.Password)
	if err != nil {
		http.Error(w, "failed to process password", http.StatusInternalServerError)
		return
	}
	user, err := h.service.Create(r.Context(), req.Username, req.Email, hashedPassword)

	if err != nil {
		log.Printf("create user error: %v", err)
		http.Error(w, "failed to create user", http.StatusInternalServerError)
		return
	}

	// Registering logs the user in immediately, the same as if they'd
	// followed it with a login call — one step from the client's side.
	err = h.sessions.IssueCookie(r.Context(), w, user.ID)
	if err != nil {
		log.Printf("issue session on register: %v", err)
		http.Error(w, "account created but failed to start session", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(user)
}

// List searches users by username, for starting a new conversation. Requires
// auth only to know who to exclude from the results, not to gate the feature.
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	currentUserID, ok := session.UserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	query := r.URL.Query().Get("q")

	results, err := h.service.Search(r.Context(), query, currentUserID)
	if err != nil {
		log.Printf("search users error: %v", err)
		http.Error(w, "failed to search users", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(results)
}

type updateProfileRequest struct {
	Username string `json:"username"`
	Email    string `json:"email"`
}

func (h *Handler) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	userID, ok := session.UserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req updateProfileRequest

	err := json.NewDecoder(r.Body).Decode(&req)
	if err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.Username == "" || req.Email == "" {
		http.Error(w, "username and email are required", http.StatusBadRequest)
		return
	}

	user, err := h.service.UpdateProfile(r.Context(), userID, req.Username, req.Email)
	if err != nil {
		if field := uniqueConstraintField(err); field != "" {
			http.Error(w, field+" is already taken", http.StatusConflict)
			return
		}
		log.Printf("update profile error: %v", err)
		http.Error(w, "failed to update profile", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(user)
}

type updatePasswordRequest struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

func (h *Handler) UpdatePassword(w http.ResponseWriter, r *http.Request) {
	userID, ok := session.UserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req updatePasswordRequest

	err := json.NewDecoder(r.Body).Decode(&req)
	if err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if len(req.NewPassword) < minPasswordLength {
		http.Error(w, "new password must be at least 8 characters", http.StatusBadRequest)
		return
	}

	currentHash, err := h.service.GetPasswordHash(r.Context(), userID)
	if err != nil {
		log.Printf("load password hash error: %v", err)
		http.Error(w, "failed to update password", http.StatusInternalServerError)
		return
	}

	err = security.CheckPassword(req.CurrentPassword, currentHash)
	if err != nil {
		http.Error(w, "current password is incorrect", http.StatusUnauthorized)
		return
	}

	newHash, err := security.HashPassword(req.NewPassword)
	if err != nil {
		http.Error(w, "failed to process password", http.StatusInternalServerError)
		return
	}

	err = h.service.UpdatePasswordHash(r.Context(), userID, newHash)
	if err != nil {
		log.Printf("update password error: %v", err)
		http.Error(w, "failed to update password", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	_, ok := session.UserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	userID := r.PathValue("id")

	user, err := h.service.GetByID(r.Context(), userID)
	if err != nil {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(user)
}
