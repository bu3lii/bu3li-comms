package users

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type User struct {
	ID        string    `json:"id"`
	Username  string    `json:"username"`
	Email     string    `json:"email"`
	HasAvatar bool      `json:"has_avatar"`
	CreatedAt time.Time `json:"created_at"`
}

type UserWithPassword struct {
	ID           string
	Username     string
	Email        string
	PasswordHash string
	HasAvatar    bool
	CreatedAt    time.Time
}

// Avatar is a small image stored alongside a user, the same shape as a
// message's voice/media attachment.
type Avatar struct {
	MimeType string
	Data     []byte
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
		RETURNING id,username,email,created_at
	`, username, email, passwordHash).Scan(&user.ID, &user.Username, &user.Email, &user.CreatedAt)

	return user, err
}

func (s *Service) GetByEmail(ctx context.Context, email string) (UserWithPassword, error) {
	var user UserWithPassword

	err := s.db.QueryRow(ctx, `
		SELECT u.id, u.username, u.email, u.password_hash, u.created_at,
			EXISTS(SELECT 1 FROM user_avatars a WHERE a.user_id = u.id)
		FROM users u
		WHERE u.email = $1
	`, email).Scan(&user.ID, &user.Username, &user.Email, &user.PasswordHash, &user.CreatedAt, &user.HasAvatar)

	return user, err
}

func (s *Service) GetByID(ctx context.Context, userID string) (User, error) {
	var user User

	err := s.db.QueryRow(ctx, `
		SELECT u.id, u.username, u.email, u.created_at,
			EXISTS(SELECT 1 FROM user_avatars a WHERE a.user_id = u.id)
		FROM users u
		WHERE u.id = $1
	`, userID).Scan(&user.ID, &user.Username, &user.Email, &user.CreatedAt, &user.HasAvatar)

	return user, err
}

func (s *Service) UpdateProfile(ctx context.Context, userID string, username string, email string) (User, error) {
	var user User

	err := s.db.QueryRow(ctx, `
		UPDATE users
		SET username = $1, email = $2
		WHERE id = $3
		RETURNING id, username, email, created_at,
			EXISTS(SELECT 1 FROM user_avatars a WHERE a.user_id = users.id)
	`, username, email, userID).Scan(&user.ID, &user.Username, &user.Email, &user.CreatedAt, &user.HasAvatar)

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
		SELECT u.id, u.username, u.email, u.created_at,
			EXISTS(SELECT 1 FROM user_avatars a WHERE a.user_id = u.id)
		FROM users u
		WHERE u.username ILIKE '%' || $1 || '%'
			AND u.id != $2
		ORDER BY u.username
		LIMIT $3
	`, query, excludeUserID, searchLimit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	users := []User{}

	for rows.Next() {
		var user User

		err := rows.Scan(&user.ID, &user.Username, &user.Email, &user.CreatedAt, &user.HasAvatar)
		if err != nil {
			return nil, err
		}

		users = append(users, user)
	}

	return users, rows.Err()
}

// UpsertAvatar stores or replaces userID's avatar image.
func (s *Service) UpsertAvatar(ctx context.Context, userID string, mimeType string, data []byte) error {
	_, err := s.db.Exec(ctx, `
		INSERT INTO user_avatars (user_id, mime_type, data)
		VALUES ($1, $2, $3)
		ON CONFLICT (user_id) DO UPDATE SET
			mime_type = excluded.mime_type,
			data = excluded.data,
			updated_at = NOW()
	`, userID, mimeType, data)

	return err
}

func (s *Service) GetAvatar(ctx context.Context, userID string) (Avatar, error) {
	var avatar Avatar

	err := s.db.QueryRow(ctx, `
		SELECT mime_type, data
		FROM user_avatars
		WHERE user_id = $1
	`, userID).Scan(&avatar.MimeType, &avatar.Data)

	return avatar, err
}

func (s *Service) DeleteAvatar(ctx context.Context, userID string) error {
	_, err := s.db.Exec(ctx, `
		DELETE FROM user_avatars
		WHERE user_id = $1
	`, userID)

	return err
}
