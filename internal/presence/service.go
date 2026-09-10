package presence

import (
	"context"
	"time"

	"github.com/redis/go-redis/v9"
)

const presenceTTL = 90 * time.Second

type Service struct {
	redis *redis.Client
}

func NewService(rdb *redis.Client) *Service {
	return &Service{redis: rdb}
}

func (s *Service) SetOnline(ctx context.Context, userID string) error {
	return s.redis.Set(ctx, "presence:"+userID, "online", presenceTTL).Err()
}

func (s *Service) SetOffline(ctx context.Context, userID string) error {
	return s.redis.Del(ctx, "presence:"+userID).Err()
}

func (s *Service) IsOnline(ctx context.Context, userID string) (bool, error) {
	n, err := s.redis.Exists(ctx, "presence:"+userID).Result()

	return n > 0, err
}

func (s *Service) Refresh(ctx context.Context, userID string) error {
	return s.redis.Expire(ctx, "presence:"+userID, presenceTTL).Err()
}
