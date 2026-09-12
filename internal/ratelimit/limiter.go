// Package ratelimit provides a small Redis-backed fixed-window counter for
// throttling sensitive or abusable actions (login attempts, message sends,
// media uploads). A fixed window is simpler than a sliding one and good
// enough at this scale — it can allow a short burst at the window boundary,
// which isn't worth the extra complexity to close off here.
package ratelimit

import (
	"context"
	"net"
	"net/http"
	"time"

	"github.com/redis/go-redis/v9"
)

type Limiter struct {
	redis *redis.Client
}

func NewLimiter(rdb *redis.Client) *Limiter {
	return &Limiter{redis: rdb}
}

// Allow reports whether the action identified by key may proceed, given at
// most limit occurrences per window. The first call for a given key starts
// the window; it expires (and resets the count) after window elapses.
//
// On a Redis error, Allow fails open (returns true) — a rate limiter that's
// temporarily unreachable shouldn't take the whole app down with it.
func (l *Limiter) Allow(ctx context.Context, key string, limit int, window time.Duration) bool {
	count, err := l.redis.Incr(ctx, key).Result()
	if err != nil {
		return true
	}

	if count == 1 {
		l.redis.Expire(ctx, key, window)
	}

	return count <= int64(limit)
}

// ClientIP extracts the request's remote host, stripping the port. Good
// enough for a single-instance deployment with no reverse proxy in front;
// a real production deployment behind one would need to trust a specific
// X-Forwarded-For hop instead.
func ClientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
