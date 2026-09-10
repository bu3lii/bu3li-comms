package realtime

import (
	"context"
	"encoding/json"
	"sync"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

type Event struct {
	Type string `json:"type"`
	Data any    `json:"data"`
}

type IncomingEvent struct {
	Type string          `json:"type"`
	Data json.RawMessage `json:"data"`
}

type Client struct {
	UserID string
	Conn   *websocket.Conn

	writeMu sync.Mutex
}

type Hub struct {
	mu      sync.RWMutex
	clients map[string]map[*Client]struct{}
}

func NewHub() *Hub {
	return &Hub{
		clients: make(map[string]map[*Client]struct{}),
	}
}

func (h *Hub) Register(client *Client) bool {
	h.mu.Lock()
	defer h.mu.Unlock()

	connections := h.clients[client.UserID]

	firstConnection := len(connections) == 0

	if connections == nil {
		connections = make(map[*Client]struct{})
		h.clients[client.UserID] = connections
	}

	connections[client] = struct{}{}

	return firstConnection
}

func (h *Hub) Unregister(client *Client) bool {
	h.mu.Lock()
	defer h.mu.Unlock()

	connections := h.clients[client.UserID]

	if connections == nil {
		return true
	}
	delete(connections, client)

	lastConnection := len(connections) == 0

	if lastConnection {
		delete(h.clients, client.UserID)
	}

	return lastConnection
}

func (h *Hub) SendToUser(ctx context.Context, userID string, event Event) {
	h.mu.RLock()

	var clients []*Client
	for client := range h.clients[userID] {
		clients = append(clients, client)
	}

	h.mu.RUnlock()

	for _, client := range clients {
		_ = client.Write(ctx, event)
	}
}

func (c *Client) Write(ctx context.Context, event Event) error {
	c.writeMu.Lock()
	defer c.writeMu.Unlock()

	return wsjson.Write(ctx, c.Conn, event)
}

func (h *Hub) ConnectionCount(userID string) int {
	h.mu.RLock()
	defer h.mu.RUnlock()

	return len(h.clients[userID])
}
