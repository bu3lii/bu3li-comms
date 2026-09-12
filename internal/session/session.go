// Package session owns session storage and the session_id cookie. It's
// split out from internal/auth so that any handler which establishes a
// session (login, but also registration) can depend on it directly,
// without an import cycle through internal/auth.
package session

import (
	"context"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

const TTL = 7 * 24 * time.Hour

const CookieName = "session_id"

type contextKey string

const userIDKey contextKey = "userID"

// WithUserID attaches the authenticated user's id to ctx, for RequireAuth
// middleware to call once it has resolved the session cookie.
func WithUserID(ctx context.Context, userID string) context.Context {
	return context.WithValue(ctx, userIDKey, userID)
}

// UserIDFromContext reads the id attached by WithUserID.
func UserIDFromContext(ctx context.Context) (string, bool) {
	userID, ok := ctx.Value(userIDKey).(string)
	return userID, ok
}

type Service struct {
	redis *redis.Client
}

func NewService(rdb *redis.Client) *Service {
	return &Service{redis: rdb}
}

func (s *Service) Create(ctx context.Context, userID string) (string, error) {
	sessionID := uuid.NewString()

	err := s.redis.Set(ctx, "session:"+sessionID, userID, TTL).Err()
	if err != nil {
		return "", err
	}

	return sessionID, nil
}

func (s *Service) Delete(ctx context.Context, sessionID string) error {
	return s.redis.Del(ctx, "session:"+sessionID).Err()
}

func (s *Service) GetUserID(ctx context.Context, sessionID string) (string, error) {
	return s.redis.Get(ctx, "session:"+sessionID).Result()
}

// IssueCookie creates a new session for userID and sets the session cookie
// on the response. Used by both login and registration.
func (s *Service) IssueCookie(ctx context.Context, w http.ResponseWriter, userID string) error {
	sessionID, err := s.Create(ctx, userID)
	if err != nil {
		return err
	}

	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    sessionID,
		Path:     "/",
		HttpOnly: true,
		Secure:   false,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(TTL.Seconds()),
	})

	return nil
}

// ClearCookie deletes the session referenced by the request's cookie (if
// any) and instructs the browser to drop it.
func (s *Service) ClearCookie(ctx context.Context, w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(CookieName)
	if err == nil {
		_ = s.Delete(ctx, cookie.Value)
	}

	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   false,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})
}
