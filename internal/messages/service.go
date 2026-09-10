package messages

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Message struct {
	ID              string    `json:"id"`
	ConversationID  string    `json:"conversation_id"`
	SenderID        string    `json:"sender_id"`
	ClientMessageID string    `json:"client_message_id"`
	Content         string    `json:"content"`
	Version         int       `json:"version"`
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

func (s *Service) MarkRead(ctx context.Context, messageID string, userID string) (time.Time, error) {
	var readAt time.Time

	err := s.db.QueryRow(ctx, `
		INSERT INTO message_receipts (message_id, user_id)
		VALUES ($1::uuid, $2::uuid)

		ON CONFLICT (message_id, user_id)
		DO UPDATE SET read_at = message_receipts.read_at

		RETURNING read_at
	`, messageID, userID).Scan(&readAt)

	return readAt, err
}

func (s *Service) GetConversationID(ctx context.Context, messageID string) (string, error) {
	var conversationID string

	err := s.db.QueryRow(ctx, `
		SELECT conversation_id
		FROM messages
		WHERE id = $1::uuid
	`, messageID).Scan(&conversationID)

	return conversationID, err
}

func (s *Service) Update(ctx context.Context, messageID string, senderID string, expectedVersion int, content string) (Message, error) {
	var message Message

	err := s.db.QueryRow(ctx, `
		UPDATE messages
		SET
			content = $1,
			version = version + 1,
			updated_at = NOW()
		WHERE id = $2::uuid
			AND sender_id = $3::uuid
			AND version = $4
		RETURNING
			id,
			conversation_id,
			sender_id,
			client_message_id,
			content,
			version,
			created_at,
			updated_at
	`, content, messageID, senderID, expectedVersion).Scan(&message.ID, &message.ConversationID, &message.SenderID, &message.ClientMessageID, &message.Content, &message.Version, &message.CreatedAt, &message.UpdatedAt)

	return message, err
}

func (s *Service) Delete(ctx context.Context, messageID string, senderID string) (Message, error) {
	var message Message

	err := s.db.QueryRow(ctx, `
		DELETE FROM messages
		WHERE id = $1::uuid
			AND sender_id = $2::uuid
		RETURNING
			id,
			conversation_id,
			sender_id,
			client_message_id,
			content,
			version,
			created_at,
			updated_at
	`, messageID, senderID).Scan(&message.ID, &message.ConversationID, &message.SenderID, &message.ClientMessageID, &message.Content, &message.Version, &message.CreatedAt, &message.UpdatedAt)

	return message, err
}
