package messages

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Message struct {
	ID              string `json:"id"`
	ConversationID  string `json:"conversation_id"`
	SenderID        string `json:"sender_id"`
	ClientMessageID string `json:"client_message_id"`
	Content         string `json:"content"`
	Version         int    `json:"version"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

type Service struct {
	db *pgxpool.Pool
}

func NewService(db *pgxpool.Pool) *Service {
	return &Service{db: db}
}

func (s *Service) Create(ctx context.Context, conversationID string, senderID string, clientMessageID string, content string) (Message, error) {
	var message Message

	err := s.db.QueryRow(ctx, `
		INSERT INTO messages (conversation_id, sender_id, client_message_id, content)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (sender_id, client_message_id)
		DO UPDATE SET content = messages.content
		RETURNING id, conversation_id, sender_id, client_message_id, content, version, created_at, updated_at
	`, conversationID, senderID, clientMessageID, content).Scan(&message.ID, &message.ConversationID, &message.SenderID, &message.ClientMessageID, &message.Content, &message.Version, &message.CreatedAt, &message.UpdatedAt)

	return message, err
}

func (s *Service) ListByConversation(ctx context.Context, conversationID string) ([]Message, error) {
	rows, err := s.db.Query(ctx, `
		SELECT id, conversation_id, sender_id, client_message_id, content, version, created_at, updated_at
		FROM messages
		WHERE conversation_id = $1
		ORDER BY created_at DESC
	`, conversationID)

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []Message

	for rows.Next() {
		var message Message

		err := rows.Scan(
			&message.ID,
			&message.ConversationID,
			&message.SenderID,
			&message.ClientMessageID,
			&message.Content,
			&message.Version,
			&message.CreatedAt,
			&message.UpdatedAt,
		)

		if err != nil {
			return nil, err
		}

		messages = append(messages, message)
	}

	return messages, rows.Err()
}
