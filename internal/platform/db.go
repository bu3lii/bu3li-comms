package platform

import (
	"context"
	"fmt"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
)

func NewDB(ctx context.Context) (*pgxpool.Pool, error) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://app:app@localhost:5433/realtime?sslmode=disable"
	}

	db,err := pgxpool.New(ctx,dsn)
	if err != nil {
		return nil, fmt.Errorf("create db pool failed: %w", err)
	}

	err = db.Ping(ctx)
	if err != nil {
		return nil, fmt.Errorf("ping db: %w",err)
	}

	return db,nil
}