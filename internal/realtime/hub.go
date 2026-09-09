package realtime

import (
	"context"
	"sync"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

type Event struct {
	Type string `json:"type"`
	Data any    `json:"data"`
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

func (h *Hub) Register(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.clients[client.UserID] == nil {
		h.clients[client.UserID] = make(map[*Client]struct{})
	}

	h.clients[client.UserID][client] = struct{}{}
}

func (h *Hub) Unregister(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	connections := h.clients[client.UserID]
	delete(connections, client)

	if len(connections) == 0 {
		delete(h.clients, client.UserID)
	}
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

	return wsjson.Write(ctx,c.Conn,event)
}