package platform

import(
	"context"
	"fmt"
	"os"

	"github.com/redis/go-redis/v9"
)

func NewRedis(ctx context.Context) (*redis.Client,error) {
	addr := os.Getenv("REDIS_ADDR")
	if addr == "" {
		addr = "localhost:6379"
	}

	rdb := redis.NewClient(&redis.Options{
		Addr: addr,
	})

	err := rdb.Ping(ctx).Err()
	if err != nil {
		return nil, fmt.Errorf("ping redis: %w",err)
	}

	return rdb,nil
}