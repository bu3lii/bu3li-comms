package messages

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Message struct {
	ID                   string    `json:"id"`
	ConversationID       string    `json:"conversation_id"`
	SenderID             string    `json:"sender_id"`
	ClientMessageID      string    `json:"client_message_id"`
	Content              string    `json:"content"`
	Version              int       `json:"version"`
	CreatedAt            time.Time `json:"created_at"`
	UpdatedAt            time.Time `json:"updated_at"`
	HasAttachment        bool      `json:"has_attachment,omitempty"`
	AttachmentDurationMs int       `json:"attachment_duration_ms,omitempty"`
}

type Attachment struct {
	MimeType string
	Data     []byte
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
		SELECT
			m.id, m.conversation_id, m.sender_id, m.client_message_id, COALESCE(m.content, ''),
			m.version, m.created_at, m.updated_at,
			(a.message_id IS NOT NULL), COALESCE(a.duration_ms, 0)
		FROM messages m
		LEFT JOIN message_attachments a ON a.message_id = m.id
		WHERE m.conversation_id = $1
		ORDER BY m.created_at DESC
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
			&message.HasAttachment,
			&message.AttachmentDurationMs,
		)

		if err != nil {
			return nil, err
		}

		messages = append(messages, message)
	}

	return messages, rows.Err()
}

// CreateVoice stores a voice message: a messages row with no text content,
// plus its audio bytes in message_attachments. ON CONFLICT mirrors Create's
// idempotency behavior for retried sends with the same client_message_id.
func (s *Service) CreateVoice(ctx context.Context, conversationID string, senderID string, clientMessageID string, mimeType string, durationMs int, data []byte) (Message, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return Message{}, err
	}
	defer tx.Rollback(ctx)

	var message Message

	err = tx.QueryRow(ctx, `
		INSERT INTO messages (conversation_id, sender_id, client_message_id, content)
		VALUES ($1, $2, $3, NULL)
		ON CONFLICT (sender_id, client_message_id)
		DO UPDATE SET content = messages.content
		RETURNING id, conversation_id, sender_id, client_message_id, COALESCE(content, ''), version, created_at, updated_at
	`, conversationID, senderID, clientMessageID).Scan(
		&message.ID, &message.ConversationID, &message.SenderID, &message.ClientMessageID,
		&message.Content, &message.Version, &message.CreatedAt, &message.UpdatedAt,
	)
	if err != nil {
		return Message{}, err
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO message_attachments (message_id, mime_type, duration_ms, data)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (message_id) DO NOTHING
	`, message.ID, mimeType, durationMs, data)
	if err != nil {
		return Message{}, err
	}

	err = tx.Commit(ctx)
	if err != nil {
		return Message{}, err
	}

	message.HasAttachment = true
	message.AttachmentDurationMs = durationMs

	return message, nil
}

func (s *Service) GetAttachment(ctx context.Context, messageID string) (Attachment, error) {
	var attachment Attachment

	err := s.db.QueryRow(ctx, `
		SELECT mime_type, data
		FROM message_attachments
		WHERE message_id = $1::uuid
	`, messageID).Scan(&attachment.MimeType, &attachment.Data)

	return attachment, err
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
