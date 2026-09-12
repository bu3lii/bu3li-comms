package realtime

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/bu3lii/bu3li-comms/internal/conversations"
	"github.com/bu3lii/bu3li-comms/internal/presence"
	"github.com/bu3lii/bu3li-comms/internal/session"
	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

type Handler struct {
	hub           *Hub
	presence      *presence.Service
	conversations *conversations.Service
	messages      MessageStore
	calls         *CallRegistry
}

type typingEventData struct {
	ConversationID string `json:"conversation_id"`
}

type messageReadData struct {
	MessageID string `json:"message_id"`
}

type callEventData struct {
	ConversationID string `json:"conversation_id"`
}

type webrtcSignalData struct {
	ConversationID string `json:"conversation_id"`
	TargetUserID   string `json:"target_user_id"`
}

type MessageStore interface {
	GetConversationID(ctx context.Context, messageID string) (string, error)
	MarkRead(ctx context.Context, messageID string, userID string) (time.Time, error)
}

func NewHandler(hub *Hub, presenceService *presence.Service, conversationService *conversations.Service, messageStore MessageStore) *Handler {
	return &Handler{
		hub:           hub,
		presence:      presenceService,
		conversations: conversationService,
		messages:      messageStore,
		calls:         NewCallRegistry(),
	}
}

func (h *Handler) Connect(w http.ResponseWriter, r *http.Request) {
	userID, ok := session.UserIDFromContext(r.Context())
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

	// Every new connection (not just the first) wants to know who among its
	// peers is already online — broadcastPresence above only pushes this
	// connection's own status to peers, it doesn't tell this connection
	// anything about them.
	h.sendPresenceSnapshot(context.Background(), userID)

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

		h.leaveAllCalls(context.Background(), userID)
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

		case "call.join":
			h.handleCallJoin(ctx, userID, event)

		case "call.leave":
			h.handleCallLeave(ctx, userID, event)

		case "webrtc.offer", "webrtc.answer", "webrtc.ice_candidate":
			h.handleWebRTCSignal(ctx, userID, event)

		default:
			log.Printf("unknown websocket event type=%s", event.Type)
		}
	}

	log.Printf("websocket disconnected user=%s", userID)
}

func (h *Handler) sendPresenceSnapshot(ctx context.Context, userID string) {
	peerIDs, err := h.conversations.ListPeerIDs(ctx, userID)
	if err != nil {
		log.Printf("list presence snapshot peers: %v", err)
		return
	}

	h.sendPresenceSnapshotFor(ctx, userID, peerIDs)
}

func (h *Handler) sendPresenceSnapshotFor(ctx context.Context, userID string, peerIDs []string) {
	onlineUserIDs := make([]string, 0, len(peerIDs))
	for _, peerID := range peerIDs {
		online, err := h.presence.IsOnline(ctx, peerID)
		if err != nil {
			log.Printf("check peer presence: %v", err)
			continue
		}
		if online {
			onlineUserIDs = append(onlineUserIDs, peerID)
		}
	}

	h.hub.SendToUser(ctx, userID, Event{
		Type: "presence.snapshot",
		Data: map[string][]string{"online_user_ids": onlineUserIDs},
	})
}

// NotifyMembershipAdded implements conversations.MembershipNotifier. Presence
// is otherwise only pushed on connect/disconnect, so two already-connected
// users who just became conversation members would never learn about each
// other without this: it gives the new member a presence snapshot of the
// conversation's other current members, and tells those members the new
// member is online, if they are.
func (h *Handler) NotifyMembershipAdded(ctx context.Context, conversationID string, newUserID string) {
	memberIDs, err := h.conversations.ListMemberIDs(ctx, conversationID)
	if err != nil {
		log.Printf("notify membership added: list members: %v", err)
		return
	}

	otherMemberIDs := make([]string, 0, len(memberIDs))
	for _, memberID := range memberIDs {
		if memberID != newUserID {
			otherMemberIDs = append(otherMemberIDs, memberID)
		}
	}

	h.sendPresenceSnapshotFor(ctx, newUserID, otherMemberIDs)

	newUserOnline, err := h.presence.IsOnline(ctx, newUserID)
	if err != nil {
		log.Printf("notify membership added: check new member presence: %v", err)
		return
	}
	if !newUserOnline {
		return
	}

	online := Event{Type: "user.online", Data: map[string]string{"user_id": newUserID}}
	for _, memberID := range otherMemberIDs {
		h.hub.SendToUser(ctx, memberID, online)
	}
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

		h.hub.SendToUser(ctx, memberID, outgoing)
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

		h.hub.SendToUser(ctx, memberId, outgoing)
	}
}

// handleCallJoin adds userID to the conversation's call. If the call was
// empty and the conversation is direct, this rings the other member
// (call.created) the way a phone call does. Group conversations don't ring
// anyone — a voice channel is opt-in and ambient, like Discord: idle
// members just see it's active via call.joined, which (unlike call.created)
// always goes to every conversation member, not just current call
// participants, so they know who's in it without joining.
func (h *Handler) handleCallJoin(ctx context.Context, userID string, event IncomingEvent) {
	var data callEventData

	err := json.Unmarshal(event.Data, &data)
	if err != nil {
		log.Printf("invalid call.join event: %v", err)
		return
	}

	isMember, err := h.conversations.IsMember(ctx, data.ConversationID, userID)
	if err != nil {
		log.Printf("call join membership check: %v", err)
		return
	}
	if !isMember {
		return
	}

	participants, started := h.calls.Join(data.ConversationID, userID)

	memberIDs, err := h.conversations.ListMemberIDs(ctx, data.ConversationID)
	if err != nil {
		log.Printf("list call recipients: %v", err)
		return
	}

	if started {
		conversationType, err := h.conversations.GetType(ctx, data.ConversationID)
		if err != nil {
			log.Printf("get conversation type for ring: %v", err)
		} else if conversationType == "direct" {
			created := Event{
				Type: "call.created",
				Data: map[string]string{
					"conversation_id": data.ConversationID,
					"caller_id":       userID,
				},
			}
			for _, memberID := range memberIDs {
				if memberID == userID {
					continue
				}
				h.hub.SendToUser(ctx, memberID, created)
			}
		}
	}

	joined := Event{
		Type: "call.joined",
		Data: map[string]any{
			"conversation_id": data.ConversationID,
			"user_id":         userID,
			"participants":    participants,
		},
	}
	for _, memberID := range memberIDs {
		h.hub.SendToUser(ctx, memberID, joined)
	}
}

func (h *Handler) handleCallLeave(ctx context.Context, userID string, event IncomingEvent) {
	var data callEventData

	err := json.Unmarshal(event.Data, &data)
	if err != nil {
		log.Printf("invalid call.leave event: %v", err)
		return
	}

	participants, ended := h.calls.Leave(data.ConversationID, userID)
	if ended {
		h.broadcastCallEnded(ctx, data.ConversationID)
		return
	}

	h.broadcastCallLeft(ctx, data.ConversationID, userID, participants)
}

// leaveAllCalls handles a dropped connection (tab closed, network loss)
// the same way as an explicit call.leave for every call the user was in.
func (h *Handler) leaveAllCalls(ctx context.Context, userID string) {
	for _, result := range h.calls.LeaveAll(userID) {
		if result.Ended {
			h.broadcastCallEnded(ctx, result.ConversationID)
			continue
		}
		h.broadcastCallLeft(ctx, result.ConversationID, userID, result.Participants)
	}
}

func (h *Handler) broadcastCallEnded(ctx context.Context, conversationID string) {
	memberIDs, err := h.conversations.ListMemberIDs(ctx, conversationID)
	if err != nil {
		log.Printf("list call-ended recipients: %v", err)
		return
	}

	ev := Event{Type: "call.ended", Data: map[string]string{"conversation_id": conversationID}}
	for _, memberID := range memberIDs {
		h.hub.SendToUser(ctx, memberID, ev)
	}
}

// broadcastCallLeft notifies every conversation member (not just remaining
// call participants) so an idle member watching the voice channel sees the
// participant count update, and the leaver's own other connections (a
// second tab/device) stay in sync too.
func (h *Handler) broadcastCallLeft(ctx context.Context, conversationID string, userID string, participants []string) {
	memberIDs, err := h.conversations.ListMemberIDs(ctx, conversationID)
	if err != nil {
		log.Printf("list call-left recipients: %v", err)
		memberIDs = append(participants, userID)
	}

	ev := Event{
		Type: "call.left",
		Data: map[string]any{
			"conversation_id": conversationID,
			"user_id":         userID,
			"participants":    participants,
		},
	}
	for _, memberID := range memberIDs {
		h.hub.SendToUser(ctx, memberID, ev)
	}
}

// handleWebRTCSignal relays an offer/answer/ICE candidate to its
// target_user_id, substituting from_user_id so the recipient knows who
// sent it. Both parties must currently be members of the conversation.
func (h *Handler) handleWebRTCSignal(ctx context.Context, userID string, event IncomingEvent) {
	var data webrtcSignalData

	err := json.Unmarshal(event.Data, &data)
	if err != nil {
		log.Printf("invalid %s event: %v", event.Type, err)
		return
	}
	if data.TargetUserID == "" {
		return
	}

	isMember, err := h.conversations.IsMember(ctx, data.ConversationID, userID)
	if err != nil || !isMember {
		return
	}

	isTargetMember, err := h.conversations.IsMember(ctx, data.ConversationID, data.TargetUserID)
	if err != nil || !isTargetMember {
		return
	}

	var payload map[string]any
	if err := json.Unmarshal(event.Data, &payload); err != nil {
		log.Printf("re-decode %s payload: %v", event.Type, err)
		return
	}
	delete(payload, "target_user_id")
	payload["from_user_id"] = userID

	h.hub.SendToUser(ctx, data.TargetUserID, Event{Type: event.Type, Data: payload})
}
