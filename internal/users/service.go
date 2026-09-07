package users

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

type User struct {
	ID       string `json:"id"`
	Username string `json:"username"`
	Email    string `json:"email"`
}

type UserWithPassword struct {
	ID string
	Username string
	Email string
	PasswordHash string
}

type Service struct {
	db *pgxpool.Pool
}

func NewService(db *pgxpool.Pool) *Service {
	return &Service{db: db}
}

func (s *Service) Create(ctx context.Context, username string, email string, passwordHash string) (User, error) {
	var user User

	err := s.db.QueryRow(ctx, `
		INSERT INTO users (username,email,password_hash)
		VALUES ($1, $2, $3)
		RETURNING id,username,email
	`, username, email, passwordHash).Scan(&user.ID, &user.Username, &user.Email)

	return user, err
}

func (s *Service) GetByEmail(ctx context.Context, email string) (UserWithPassword,error) {
	var user UserWithPassword

	err := s.db.QueryRow(ctx,`
		SELECT id,username,email,password_hash
		FROM users
		WHERE email = $1
	`,email).Scan(&user.ID,&user.Username,&user.Email,&user.PasswordHash)

	return user,err
}

func (s *Service) GetByID(ctx context.Context, userID string) (User,error) {
	var user User

	err := s.db.QueryRow(ctx,`
		SELECT id, username, email
		FROM users
		WHERE id = $1
	`,userID).Scan(&user.ID,&user.Username,&user.Email)

	return user,err
}