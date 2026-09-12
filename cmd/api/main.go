package main

import (
	"context"
	"log"
	"net/http"

	"github.com/bu3lii/bu3li-comms/internal/auth"
	"github.com/bu3lii/bu3li-comms/internal/conversations"
	"github.com/bu3lii/bu3li-comms/internal/messages"
	"github.com/bu3lii/bu3li-comms/internal/platform"
	"github.com/bu3lii/bu3li-comms/internal/presence"
	"github.com/bu3lii/bu3li-comms/internal/realtime"
	"github.com/bu3lii/bu3li-comms/internal/session"
	"github.com/bu3lii/bu3li-comms/internal/users"
	"github.com/bu3lii/bu3li-comms/migrations"
)

func main() {
	ctx := context.Background()

	db, err := platform.NewDB(ctx)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	err = platform.RunMigrations(ctx, db, migrations.FS)
	if err != nil {
		log.Fatal(err)
	}

	rdb, err := platform.NewRedis(ctx)
	if err != nil {
		log.Fatal(err)
	}
	defer rdb.Close()

	userService := users.NewService(db)
	sessionService := session.NewService(rdb)

	userHandler := users.NewHandler(userService, sessionService)
	authHandler := auth.NewHandler(userService, sessionService)

	conversationService := conversations.NewService(db)
	presenceService := presence.NewService(rdb)
	hub := realtime.NewHub()
	messageService := messages.NewService(db)

	realtimeHandler := realtime.NewHandler(hub, presenceService, conversationService, messageService)
	// realtimeHandler also implements conversations.MembershipNotifier, so a
	// newly-added member's presence syncs with the rest of the conversation
	// immediately instead of waiting for someone to reconnect.
	conversationHandler := conversations.NewHandler(conversationService, realtimeHandler)
	messageHandler := messages.NewHandler(messageService, conversationService, hub)

	mux := http.NewServeMux()

	mux.HandleFunc("POST /users", userHandler.Create)
	mux.Handle("GET /users", authHandler.RequireAuth(http.HandlerFunc(userHandler.List)))
	mux.Handle("GET /users/{id}", authHandler.RequireAuth(http.HandlerFunc(userHandler.Get)))
	mux.HandleFunc("POST /login", authHandler.Login)
	mux.Handle("POST /logout", authHandler.RequireAuth(http.HandlerFunc(authHandler.Logout)))
	mux.Handle("GET /me", authHandler.RequireAuth(http.HandlerFunc(authHandler.Me)))
	mux.Handle("PATCH /me", authHandler.RequireAuth(http.HandlerFunc(userHandler.UpdateProfile)))
	mux.Handle("PATCH /me/password", authHandler.RequireAuth(http.HandlerFunc(userHandler.UpdatePassword)))

	mux.Handle("GET /conversations", authHandler.RequireAuth(http.HandlerFunc(conversationHandler.List)))
	mux.Handle("POST /conversations", authHandler.RequireAuth(http.HandlerFunc(conversationHandler.Create)))
	mux.Handle("POST /conversations/{id}/members", authHandler.RequireAuth(http.HandlerFunc(conversationHandler.AddMember)))

	mux.Handle("POST /conversations/{id}/messages", authHandler.RequireAuth(http.HandlerFunc(messageHandler.Create)))
	mux.Handle("GET /conversations/{id}/messages", authHandler.RequireAuth(http.HandlerFunc(messageHandler.List)))
	mux.Handle("POST /conversations/{id}/messages/voice", authHandler.RequireAuth(http.HandlerFunc(messageHandler.CreateVoice)))

	mux.Handle("PATCH /messages/{messageID}", authHandler.RequireAuth(http.HandlerFunc(messageHandler.Update)))
	mux.Handle("DELETE /messages/{messageID}", authHandler.RequireAuth(http.HandlerFunc(messageHandler.Delete)))
	mux.Handle("GET /messages/{messageID}/attachment", authHandler.RequireAuth(http.HandlerFunc(messageHandler.GetAttachment)))
	mux.Handle("GET /ws", authHandler.RequireAuth(http.HandlerFunc(realtimeHandler.Connect)))

	log.Println("API listening on :8080")

	err = http.ListenAndServe(":8080", mux)
	if err != nil {
		log.Fatal(err)
	}
}
