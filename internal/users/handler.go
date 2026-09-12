package users

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"mime"
	"net/http"
	"strings"
	"time"

	"github.com/bu3lii/bu3li-comms/internal/ratelimit"
	"github.com/bu3lii/bu3li-comms/internal/security"
	"github.com/bu3lii/bu3li-comms/internal/session"
	"github.com/jackc/pgx/v5/pgconn"
)

const minPasswordLength = 8

// registrationLimit/registrationWindow throttle account creation per source
// IP — cheap insurance against scripted signup spam.
const (
	registrationLimit  = 10
	registrationWindow = time.Hour
)

// maxAvatarBytes caps an uploaded profile picture; the client is expected to
// downscale before upload, this is just a hard backstop.
const maxAvatarBytes = 4 << 20

// allowedAvatarMimeTypes mirrors the voice-message allowlist pattern in
// internal/messages: restrict to real image formats so an avatar can never
// be served back as anything a browser would execute.
var allowedAvatarMimeTypes = map[string]bool{
	"image/png":  true,
	"image/jpeg": true,
	"image/webp": true,
	"image/gif":  true,
}

func isAllowedAvatarMimeType(contentType string) bool {
	base, _, err := mime.ParseMediaType(contentType)
	if err != nil {
		return false
	}
	return allowedAvatarMimeTypes[base]
}

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
	limiter  *ratelimit.Limiter
}

func NewHandler(service *Service, sessionService *session.Service, limiter *ratelimit.Limiter) *Handler {
	return &Handler{service: service, sessions: sessionService, limiter: limiter}
}

type CreateUserRequest struct {
	Username string `json:"username"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	if !h.limiter.Allow(r.Context(), "ratelimit:register:"+ratelimit.ClientIP(r), registrationLimit, registrationWindow) {
		http.Error(w, "too many accounts created from this address, try again later", http.StatusTooManyRequests)
		return
	}

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

// UploadAvatar sets the caller's own profile picture from a raw image body,
// the same upload shape as a voice message.
func (h *Handler) UploadAvatar(w http.ResponseWriter, r *http.Request) {
	userID, ok := session.UserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	mimeType := r.Header.Get("Content-Type")
	if !isAllowedAvatarMimeType(mimeType) {
		http.Error(w, "unsupported image content type", http.StatusUnsupportedMediaType)
		return
	}

	data, err := io.ReadAll(io.LimitReader(r.Body, maxAvatarBytes+1))
	if err != nil {
		http.Error(w, "failed to read image", http.StatusInternalServerError)
		return
	}
	if len(data) == 0 {
		http.Error(w, "image is empty", http.StatusBadRequest)
		return
	}
	if len(data) > maxAvatarBytes {
		http.Error(w, "image too large", http.StatusRequestEntityTooLarge)
		return
	}

	err = h.service.UpsertAvatar(r.Context(), userID, mimeType, data)
	if err != nil {
		log.Printf("upload avatar error: %v", err)
		http.Error(w, "failed to save avatar", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// GetAvatar serves userID's avatar image. Requires auth only (not
// membership of a shared conversation) — usernames are already searchable
// app-wide, so an avatar is no more sensitive than that.
func (h *Handler) GetAvatar(w http.ResponseWriter, r *http.Request) {
	_, ok := session.UserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	userID := r.PathValue("id")

	avatar, err := h.service.GetAvatar(r.Context(), userID)
	if err != nil {
		http.Error(w, "avatar not found", http.StatusNotFound)
		return
	}

	// Upload already restricts MimeType to the image allowlist, so this can
	// never render as HTML/script — nosniff and a locked-down CSP are
	// defense-in-depth for anyone who navigates to the URL directly.
	w.Header().Set("Content-Type", avatar.MimeType)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; sandbox")
	w.Header().Set("Content-Disposition", `inline; filename="avatar"`)
	w.Header().Set("Cache-Control", "private, max-age=300")
	w.Write(avatar.Data)
}

// DeleteAvatar removes the caller's avatar, reverting them to the
// generated-initials fallback.
func (h *Handler) DeleteAvatar(w http.ResponseWriter, r *http.Request) {
	userID, ok := session.UserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	err := h.service.DeleteAvatar(r.Context(), userID)
	if err != nil {
		log.Printf("delete avatar error: %v", err)
		http.Error(w, "failed to delete avatar", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
