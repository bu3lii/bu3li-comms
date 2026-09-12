package conversations

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Conversation struct {
	ID   string `json:"id"`
	Type string `json:"type"`
}

type Member struct {
	ID       string `json:"id"`
	Username string `json:"username"`
}

type LastMessage struct {
	ID            string `json:"id"`
	SenderID      string `json:"sender_id"`
	Content       string `json:"content"`
	HasAttachment bool   `json:"has_attachment"`
	CreatedAt     string `json:"created_at"`
}

type Summary struct {
	ID          string       `json:"id"`
	Type        string       `json:"type"`
	Members     []Member     `json:"members"`
	LastMessage *LastMessage `json:"last_message,omitempty"`
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

func (s *Service) GetType(ctx context.Context, conversationID string) (string, error) {
	var conversationType string

	err := s.db.QueryRow(ctx, `
		SELECT type
		FROM conversations
		WHERE id = $1
	`, conversationID).Scan(&conversationType)

	return conversationType, err
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
	_, err := s.db.Exec(ctx, `
		INSERT INTO conversation_members (conversation_id, user_id)
		VALUES ($1, $2)
		ON CONFLICT DO NOTHING
	`, conversationID, userID)

	return err
}

func (s *Service) ListMemberIDs(ctx context.Context, conversationID string) ([]string, error) {
	rows, err := s.db.Query(ctx, `
		SELECT user_id
		FROM conversation_members
		WHERE conversation_id = $1
	`, conversationID)

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []string

	for rows.Next() {
		var id string

		err = rows.Scan(&id)
		if err != nil {
			return nil, err
		}

		ids = append(ids, id)
	}

	return ids, rows.Err()
}

// ListForUser returns every conversation userID belongs to, each with its
// member list and most recent message, newest activity first. There's no
// pagination yet — fine for a personal/demo-scale account, not for someone
// in thousands of conversations.
func (s *Service) ListForUser(ctx context.Context, userID string) ([]Summary, error) {
	rows, err := s.db.Query(ctx, `
		SELECT c.id, c.type
		FROM conversations c
		JOIN conversation_members cm ON cm.conversation_id = c.id
		WHERE cm.user_id = $1
		ORDER BY COALESCE(
			(SELECT MAX(created_at) FROM messages WHERE conversation_id = c.id),
			c.created_at
		) DESC
	`, userID)
	if err != nil {
		return nil, err
	}

	summaries := []Summary{}
	order := []string{}
	byID := map[string]*Summary{}

	for rows.Next() {
		var summary Summary

		err := rows.Scan(&summary.ID, &summary.Type)
		if err != nil {
			rows.Close()
			return nil, err
		}

		summaries = append(summaries, summary)
		order = append(order, summary.ID)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}

	for i := range summaries {
		byID[summaries[i].ID] = &summaries[i]
	}

	if len(order) == 0 {
		return summaries, nil
	}

	memberRows, err := s.db.Query(ctx, `
		SELECT cm.conversation_id, u.id, u.username
		FROM conversation_members cm
		JOIN users u ON u.id = cm.user_id
		WHERE cm.conversation_id = ANY($1)
	`, order)
	if err != nil {
		return nil, err
	}
	defer memberRows.Close()

	for memberRows.Next() {
		var conversationID string
		var member Member

		err := memberRows.Scan(&conversationID, &member.ID, &member.Username)
		if err != nil {
			return nil, err
		}

		if summary, ok := byID[conversationID]; ok {
			summary.Members = append(summary.Members, member)
		}
	}
	if err := memberRows.Err(); err != nil {
		return nil, err
	}

	messageRows, err := s.db.Query(ctx, `
		SELECT DISTINCT ON (m.conversation_id)
			m.conversation_id, m.id, m.sender_id, COALESCE(m.content, ''), m.created_at,
			(a.message_id IS NOT NULL) AS has_attachment
		FROM messages m
		LEFT JOIN message_attachments a ON a.message_id = m.id
		WHERE m.conversation_id = ANY($1)
		ORDER BY m.conversation_id, m.created_at DESC
	`, order)
	if err != nil {
		return nil, err
	}
	defer messageRows.Close()

	for messageRows.Next() {
		var conversationID string
		var last LastMessage
		var createdAt time.Time

		err := messageRows.Scan(&conversationID, &last.ID, &last.SenderID, &last.Content, &createdAt, &last.HasAttachment)
		if err != nil {
			return nil, err
		}
		last.CreatedAt = createdAt.Format(time.RFC3339Nano)

		if summary, ok := byID[conversationID]; ok {
			summary.LastMessage = &last
		}
	}
	if err := messageRows.Err(); err != nil {
		return nil, err
	}

	return summaries, nil
}

func (s *Service) ListPeerIDs(ctx context.Context, userID string) ([]string, error) {
	rows, err := s.db.Query(ctx, `
		SELECT DISTINCT cm2.user_id
		FROM conversation_members cm1
		JOIN conversation_members cm2
			ON cm1.conversation_id = cm2.conversation_id
		WHERE cm1.user_id = $1
			AND cm2.user_id != $1
	`, userID)
	if err != nil {
		return nil, err
	}

	defer rows.Close()

	var ids []string

	for rows.Next() {
		var id string

		err := rows.Scan(&id)
		if err != nil {
			return nil, err
		}

		ids = append(ids, id)
	}

	return ids, rows.Err()
}
