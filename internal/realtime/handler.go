package realtime

import (
	"context"
	"log"
	"net/http"

	"github.com/bu3lii/bu3li-comms/internal/auth"
	"github.com/coder/websocket"
)

type Handler struct {
	hub *Hub
}

func NewHandler(hub *Hub) *Handler {
	return &Handler{hub: hub}
}

func (h *Handler) Connect(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		http.Error(w,"unauthorized",http.StatusUnauthorized)
		return
	}

	conn,err := websocket.Accept(w,r,nil)
	if err != nil {
		log.Printf("websocket accept: %v", err)
		return
	}
	defer conn.CloseNow()

	client := &Client{
		UserID: userID,
		Conn: conn,
	}

	h.hub.Register(client)
	defer h.hub.Unregister(client)

	log.Printf("websocket connected user=%s", userID)

	ctx := context.Background()

	for {
		_, _, err := conn.Read(ctx)
		if err != nil {
			break
		}
	}

	log.Printf("websocket disconnected user=%s",userID)
}