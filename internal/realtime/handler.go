package realtime

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/bu3lii/bu3li-comms/internal/auth"
	"github.com/bu3lii/bu3li-comms/internal/conversations"
	"github.com/bu3lii/bu3li-comms/internal/presence"
	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

type Handler struct {
	hub           *Hub
	presence      *presence.Service
	conversations *conversations.Service
	messages      MessageStore
}

type typingEventData struct {
	ConversationID string `json:"conversation_id"`
}

type messageReadData struct {
	MessageID string `json:"message_id"`
}

type MessageStore interface {
	GetConversationID(ctx context.Context, messageID string) (string, error)
	MarkRead(ctx context.Context, messageID string, userID string) (time.Time, error)
}

func NewHandler(hub *Hub, presenceService *presence.Service, conversationService *conversations.Service, messageStore MessageStore) *Handler {
	return &Handler{hub: hub, presence: presenceService, conversations: conversationService, messages: messageStore}
}

func (h *Handler) Connect(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	conn, err := websocket.Accept(w, r, nil)
	if err != nil {
		log.Printf("websocket accept: %v", err)
		return
	}
	defer conn.CloseNow()

	client := &Client{
		UserID: userID,
		Conn:   conn,
	}

	firstConnection := h.hub.Register(client)

	if firstConnection {
		err := h.presence.SetOnline(context.Background(), userID)
		if err != nil {
			log.Printf("set user online: %v", err)
		}

		h.broadcastPresence(context.Background(), userID, "user.online")

		log.Printf("user online=%s", userID)
	}

	defer func() {
		lastConnection := h.hub.Unregister(client)

		if lastConnection {
			err := h.presence.SetOffline(context.Background(), userID)
			if err != nil {
				log.Printf("set user offline: %v", err)
			}

			h.broadcastPresence(context.Background(), userID, "user.offline")

			log.Printf("user offline=%s", userID)
		}
	}()

	log.Printf("websocket connected user=%s", userID)

	ctx := context.Background()

	done := make(chan struct{})

	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				err := h.presence.Refresh(ctx, userID)
				if err != nil {
					log.Printf("refresh presence: %v", err)
				}

			case <-done:
				return
			}
		}
	}()
	defer close(done)

	for {
		var event IncomingEvent

		err := wsjson.Read(ctx, conn, &event)
		if err != nil {
			break
		}

		switch event.Type {
		case "typing.started", "typing.stopped":
			h.handleTyping(ctx, userID, event)

		case "message.read":
			h.handleMessageRead(ctx, userID, event)

		default:
			log.Printf("unknown websocket event type=%s", event.Type)
		}
	}

	log.Printf("websocket disconnected user=%s", userID)
}

func (h *Handler) broadcastPresence(ctx context.Context, userID string, eventType string) {
	peerIDs, err := h.conversations.ListPeerIDs(ctx, userID)
	if err != nil {
		log.Printf("list presence peers: %v", err)
		return
	}

	event := Event{
		Type: eventType,
		Data: map[string]string{
			"user_id": userID,
		},
	}

	for _, peerID := range peerIDs {
		h.hub.SendToUser(ctx, peerID, event)
	}
}

func (h *Handler) handleTyping(ctx context.Context, userID string, event IncomingEvent) {
	var data typingEventData

	err := json.Unmarshal(event.Data, &data)
	if err != nil {
		log.Printf("invalid typing event: %v", err)
		return
	}

	isMember, err := h.conversations.IsMember(ctx, data.ConversationID, userID)
	if err != nil {
		log.Printf("typing membership check: %v", err)
		return
	}

	if !isMember {
		return
	}

	memberIds, err := h.conversations.ListMemberIDs(ctx, data.ConversationID)
	if err != nil {
		log.Printf("list typing recipients: %v", err)
		return
	}

	outgoing := Event{
		Type: event.Type,
		Data: map[string]string{
			"user_id":         userID,
			"conversation_id": data.ConversationID,
		},
	}

	for _, memberID := range memberIds {
		if memberID == userID {
			continue
		}

		h.hub.SendToUser(ctx, userID, outgoing)
	}
}

func (h *Handler) handleMessageRead(ctx context.Context, userID string, event IncomingEvent) {
	var data messageReadData

	err := json.Unmarshal(event.Data, &data)
	if err != nil {
		log.Printf("invalid message.read event: %v", err)
		return
	}

	conversationID, err := h.messages.GetConversationID(ctx, data.MessageID)
	if err != nil {
		log.Printf("find message conversation: %v", err)
		return
	}

	isMember, err := h.conversations.IsMember(ctx, conversationID, userID)
	if err != nil {
		log.Printf("read receipt membership check: %v", err)
		return
	}

	if !isMember {
		return
	}

	readAt, err := h.messages.MarkRead(ctx, data.MessageID, userID)
	if err != nil {
		log.Printf("mark message read: %v", err)
		return
	}

	memberIds, err := h.conversations.ListMemberIDs(ctx, conversationID)
	if err != nil {
		log.Printf("list read receipt recipients: %v", err)
		return
	}

	outgoing := Event{
		Type: "message.read",
		Data: map[string]any{
			"message_id":      data.MessageID,
			"user_id":         userID,
			"conversation_id": conversationID,
			"read_at":         readAt,
		},
	}

	for _, memberId := range memberIds {
		if memberId == userID {
			continue
		}

		h.hub.SendToUser(ctx, userID, outgoing)
	}
}
