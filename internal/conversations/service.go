package conversations

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Conversation struct {
	ID   string `json:"id"`
	Type string `json:"type"`
}

type Service struct {
	db *pgxpool.Pool
}

func NewService(db *pgxpool.Pool) *Service {
	return &Service{db: db}
}

func (s *Service) Create(ctx context.Context, conversationType string, creatorID string) (Conversation, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return Conversation{}, err
	}
	defer tx.Rollback(ctx)

	var conversation Conversation

	err = tx.QueryRow(ctx, `
		INSERT INTO conversations (type)
		VALUES ($1)
		RETURNING id, type
	`, conversationType).Scan(&conversation.ID, &conversation.Type)

	if err != nil {
		return Conversation{}, err
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO conversation_members (conversation_id, user_id)
		VALUES ($1, $2)
	`, conversation.ID, creatorID)

	if err != nil {
		return Conversation{}, err
	}

	err = tx.Commit(ctx)

	if err != nil {
		return Conversation{}, err
	}

	return conversation, nil
}

func (s *Service) IsMember(ctx context.Context, conversationID string, userID string) (bool, error) {
	var exists bool

	err := s.db.QueryRow(ctx, `
	SELECT EXISTS(
		SELECT 1
		FROM conversation_members
		WHERE conversation_id = $1
		AND user_id = $2
	)
	`, conversationID, userID).Scan(&exists)

	return exists, err
}

func (s *Service) AddMember(ctx context.Context, conversationID string, userID string) error {
	_,err := s.db.Exec(ctx,`
		INSERT INTO conversation_members (conversation_id, user_id)
		VALUES ($1, $2)
		ON CONFLICT DO NOTHING
	`,conversationID,userID)

	return err
}

func (s *Service) ListMemberIDs(ctx context.Context, conversationID string) ([]string, error) {
	rows,err := s.db.Query(ctx,`
		SELECT user_id
		FROM conversation_members
		WHERE conversation_id = $1
	`,conversationID)

	if err != nil {
		return nil,err
	}
	defer rows.Close()

	var ids []string

	for rows.Next() {
		var id string

		err = rows.Scan(&id)
		if err != nil {
			return nil,err
		}

		ids = append(ids, id)
	}

	return ids,rows.Err()
}