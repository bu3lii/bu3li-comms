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
	ID           string
	Username     string
	Email        string
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

func (s *Service) GetByEmail(ctx context.Context, email string) (UserWithPassword, error) {
	var user UserWithPassword

	err := s.db.QueryRow(ctx, `
		SELECT id,username,email,password_hash
		FROM users
		WHERE email = $1
	`, email).Scan(&user.ID, &user.Username, &user.Email, &user.PasswordHash)

	return user, err
}

func (s *Service) GetByID(ctx context.Context, userID string) (User, error) {
	var user User

	err := s.db.QueryRow(ctx, `
		SELECT id, username, email
		FROM users
		WHERE id = $1
	`, userID).Scan(&user.ID, &user.Username, &user.Email)

	return user, err
}

func (s *Service) UpdateProfile(ctx context.Context, userID string, username string, email string) (User, error) {
	var user User

	err := s.db.QueryRow(ctx, `
		UPDATE users
		SET username = $1, email = $2
		WHERE id = $3
		RETURNING id, username, email
	`, username, email, userID).Scan(&user.ID, &user.Username, &user.Email)

	return user, err
}

func (s *Service) GetPasswordHash(ctx context.Context, userID string) (string, error) {
	var hash string

	err := s.db.QueryRow(ctx, `
		SELECT password_hash
		FROM users
		WHERE id = $1
	`, userID).Scan(&hash)

	return hash, err
}

func (s *Service) UpdatePasswordHash(ctx context.Context, userID string, passwordHash string) error {
	_, err := s.db.Exec(ctx, `
		UPDATE users
		SET password_hash = $1
		WHERE id = $2
	`, passwordHash, userID)

	return err
}

const searchLimit = 20

// Search looks up users by a case-insensitive username substring, for
// starting a new conversation. Excludes excludeUserID (the caller) so
// people don't find themselves in their own search results.
func (s *Service) Search(ctx context.Context, query string, excludeUserID string) ([]User, error) {
	rows, err := s.db.Query(ctx, `
		SELECT id, username, email
		FROM users
		WHERE username ILIKE '%' || $1 || '%'
			AND id != $2
		ORDER BY username
		LIMIT $3
	`, query, excludeUserID, searchLimit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	users := []User{}

	for rows.Next() {
		var user User

		err := rows.Scan(&user.ID, &user.Username, &user.Email)
		if err != nil {
			return nil, err
		}

		users = append(users, user)
	}

	return users, rows.Err()
}
