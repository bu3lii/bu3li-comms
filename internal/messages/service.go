package messages

import (
	"context"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Message struct {
	ID                   string            `json:"id"`
	ConversationID       string            `json:"conversation_id"`
	SenderID             string            `json:"sender_id"`
	ClientMessageID      string            `json:"client_message_id"`
	Content              string            `json:"content"`
	Version              int               `json:"version"`
	CreatedAt            time.Time         `json:"created_at"`
	UpdatedAt            time.Time         `json:"updated_at"`
	HasAttachment        bool              `json:"has_attachment,omitempty"`
	AttachmentKind       string            `json:"attachment_kind,omitempty"`
	AttachmentDurationMs int               `json:"attachment_duration_ms,omitempty"`
	AttachmentWidthPx    int               `json:"attachment_width_px,omitempty"`
	AttachmentHeightPx   int               `json:"attachment_height_px,omitempty"`
	Reactions            []ReactionSummary `json:"reactions,omitempty"`
}

type Attachment struct {
	MimeType string
	Data     []byte
}

// attachmentKindFromMime buckets a stored MIME type into the coarse
// category the client renders differently by ("audio" -> waveform player,
// "image" -> lightbox, "video" -> inline player). The upload allowlists in
// handler.go already guarantee every stored mime_type falls into one of
// these three.
func attachmentKindFromMime(mimeType string) string {
	switch {
	case strings.HasPrefix(mimeType, "audio/"):
		return "audio"
	case strings.HasPrefix(mimeType, "image/"):
		return "image"
	case strings.HasPrefix(mimeType, "video/"):
		return "video"
	default:
		return ""
	}
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
			(a.message_id IS NOT NULL), COALESCE(a.mime_type, ''), COALESCE(a.duration_ms, 0),
			COALESCE(a.width_px, 0), COALESCE(a.height_px, 0)
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
	var mimeType string

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
			&mimeType,
			&message.AttachmentDurationMs,
			&message.AttachmentWidthPx,
			&message.AttachmentHeightPx,
		)

		if err != nil {
			return nil, err
		}

		if message.HasAttachment {
			message.AttachmentKind = attachmentKindFromMime(mimeType)
		}

		messages = append(messages, message)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	if err := s.attachReactions(ctx, messages); err != nil {
		return nil, err
	}

	return messages, nil
}

// attachReactions loads every reaction for the given messages in one query
// and groups them onto each message, rather than one query per message.
func (s *Service) attachReactions(ctx context.Context, messages []Message) error {
	if len(messages) == 0 {
		return nil
	}

	ids := make([]string, len(messages))
	byID := make(map[string]*Message, len(messages))
	for i := range messages {
		ids[i] = messages[i].ID
		byID[messages[i].ID] = &messages[i]
	}

	rows, err := s.db.Query(ctx, `
		SELECT message_id, emoji, user_id
		FROM message_reactions
		WHERE message_id = ANY($1)
		ORDER BY emoji, created_at
	`, ids)
	if err != nil {
		return err
	}
	defer rows.Close()

	// messageID -> emoji -> summary, preserving first-seen emoji order.
	grouped := make(map[string][]*ReactionSummary)
	index := make(map[string]map[string]*ReactionSummary)

	for rows.Next() {
		var messageID, emoji, userID string
		if err := rows.Scan(&messageID, &emoji, &userID); err != nil {
			return err
		}

		if index[messageID] == nil {
			index[messageID] = make(map[string]*ReactionSummary)
		}

		summary, ok := index[messageID][emoji]
		if !ok {
			summary = &ReactionSummary{Emoji: emoji}
			index[messageID][emoji] = summary
			grouped[messageID] = append(grouped[messageID], summary)
		}

		summary.UserIDs = append(summary.UserIDs, userID)
	}
	if err := rows.Err(); err != nil {
		return err
	}

	for messageID, summaries := range grouped {
		message, ok := byID[messageID]
		if !ok {
			continue
		}
		for _, summary := range summaries {
			message.Reactions = append(message.Reactions, *summary)
		}
	}

	return nil
}

// CreateVoice stores a voice message: a messages row with no text content,
// plus its audio bytes in message_attachments. ON CONFLICT mirrors Create's
// idempotency behavior for retried sends with the same client_message_id.
func (s *Service) CreateVoice(ctx context.Context, conversationID string, senderID string, clientMessageID string, mimeType string, durationMs int, data []byte) (Message, error) {
	message, err := s.createWithAttachment(ctx, conversationID, senderID, clientMessageID, mimeType, durationMs, 0, 0, data)
	if err != nil {
		return Message{}, err
	}

	return message, nil
}

// CreateMedia stores an image or video attachment. Shares the same
// underlying storage as CreateVoice — the difference is purely in the
// allowlist/limits the handler enforces before calling this.
func (s *Service) CreateMedia(ctx context.Context, conversationID string, senderID string, clientMessageID string, mimeType string, durationMs int, widthPx int, heightPx int, data []byte) (Message, error) {
	return s.createWithAttachment(ctx, conversationID, senderID, clientMessageID, mimeType, durationMs, widthPx, heightPx, data)
}

func (s *Service) createWithAttachment(ctx context.Context, conversationID string, senderID string, clientMessageID string, mimeType string, durationMs int, widthPx int, heightPx int, data []byte) (Message, error) {
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

	var widthArg, heightArg any
	if widthPx > 0 {
		widthArg = widthPx
	}
	if heightPx > 0 {
		heightArg = heightPx
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO message_attachments (message_id, mime_type, duration_ms, width_px, height_px, data)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (message_id) DO NOTHING
	`, message.ID, mimeType, durationMs, widthArg, heightArg, data)
	if err != nil {
		return Message{}, err
	}

	err = tx.Commit(ctx)
	if err != nil {
		return Message{}, err
	}

	message.HasAttachment = true
	message.AttachmentKind = attachmentKindFromMime(mimeType)
	message.AttachmentDurationMs = durationMs
	message.AttachmentWidthPx = widthPx
	message.AttachmentHeightPx = heightPx

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

// AddReaction records userID's emoji reaction to messageID. Idempotent: the
// same user reacting with the same emoji twice is a no-op, not an error.
func (s *Service) AddReaction(ctx context.Context, messageID string, userID string, emoji string) error {
	_, err := s.db.Exec(ctx, `
		INSERT INTO message_reactions (message_id, user_id, emoji)
		VALUES ($1::uuid, $2::uuid, $3)
		ON CONFLICT (message_id, user_id, emoji) DO NOTHING
	`, messageID, userID, emoji)

	return err
}

func (s *Service) RemoveReaction(ctx context.Context, messageID string, userID string, emoji string) error {
	_, err := s.db.Exec(ctx, `
		DELETE FROM message_reactions
		WHERE message_id = $1::uuid AND user_id = $2::uuid AND emoji = $3
	`, messageID, userID, emoji)

	return err
}
