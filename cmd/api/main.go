package main

import (
	"context"
	"log"
	"net/http"

	"github.com/bu3lii/bu3li-comms/internal/auth"
	"github.com/bu3lii/bu3li-comms/internal/conversations"
	"github.com/bu3lii/bu3li-comms/internal/messages"
	"github.com/bu3lii/bu3li-comms/internal/platform"
	"github.com/bu3lii/bu3li-comms/internal/realtime"
	"github.com/bu3lii/bu3li-comms/internal/users"
)

func main() {
	ctx := context.Background()

	db, err := platform.NewDB(ctx)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	rdb, err := platform.NewRedis(ctx)
	if err != nil {
		log.Fatal(err)
	}
	defer rdb.Close()

	userService := users.NewService(db)
	sessionService := auth.NewSessionService(rdb)

	userHandler := users.NewHandler(userService)
	authHandler := auth.NewHandler(userService,sessionService)

	conversationService := conversations.NewService(db)
	conversationHandler := conversations.NewHandler(conversationService)

	hub := realtime.NewHub()
	realtimeHandler := realtime.NewHandler(hub)

	messageService := messages.NewService(db)
	messageHandler := messages.NewHandler(messageService,conversationService,hub)


	mux := http.NewServeMux()

	mux.HandleFunc("POST /users", userHandler.Create)
	mux.HandleFunc("POST /login", authHandler.Login)
	mux.Handle("GET /me",authHandler.RequireAuth(http.HandlerFunc(authHandler.Me)))
	mux.HandleFunc("POST /logout", authHandler.Logout)

	mux.Handle("POST /conversations",authHandler.RequireAuth(http.HandlerFunc(conversationHandler.Create)))
	mux.Handle("POST /conversations/{id}/members",authHandler.RequireAuth(http.HandlerFunc(conversationHandler.AddMember)))

	mux.Handle("POST /conversations/{id}/messages",authHandler.RequireAuth(http.HandlerFunc(messageHandler.Create)))
	mux.Handle("GET /conversations/{id}/messages",authHandler.RequireAuth(http.HandlerFunc(messageHandler.List)))

	mux.Handle("GET /ws",authHandler.RequireAuth(http.HandlerFunc(realtimeHandler.Connect)))


	log.Println("API listening on :8080")

	err = http.ListenAndServe(":8080", mux)
	if err != nil {
		log.Fatal(err)
	}
}
