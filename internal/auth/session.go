package auth

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

const SessionTTL = 7 * 24 * time.Hour

type SessionService struct {
	redis *redis.Client
}

func NewSessionService(rdb *redis.Client) *SessionService {
	return &SessionService{redis: rdb}
}

func (s *SessionService) Create(ctx context.Context, userID string) (string, error) {
	sessionID := uuid.NewString()

	key := "session:" + sessionID

	err := s.redis.Set(ctx, key, userID, SessionTTL).Err()

	if err != nil {
		return "", nil
	}

	return sessionID, nil
}

func (s *SessionService) Delete(ctx context.Context, sessionID string) error {
	return s.redis.Del(ctx, "session:"+sessionID).Err()
}

func (s *SessionService) GetUserID(ctx context.Context, sessionID string) (string, error) {
	return s.redis.Get(ctx, "session:"+sessionID).Result()
}
