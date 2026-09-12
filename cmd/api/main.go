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
	"github.com/bu3lii/bu3li-comms/internal/ratelimit"
	"github.com/bu3lii/bu3li-comms/internal/realtime"
	"github.com/bu3lii/bu3li-comms/internal/servers"
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

	limiter := ratelimit.NewLimiter(rdb)

	userService := users.NewService(db)
	sessionService := session.NewService(rdb)

	userHandler := users.NewHandler(userService, sessionService, limiter)
	authHandler := auth.NewHandler(userService, sessionService, limiter)

	conversationService := conversations.NewService(db)
	presenceService := presence.NewService(rdb)
	hub := realtime.NewHub()
	messageService := messages.NewService(db)

	realtimeHandler := realtime.NewHandler(hub, presenceService, conversationService, messageService)
	// realtimeHandler also implements conversations.MembershipNotifier, so a
	// newly-added member's presence syncs with the rest of the conversation
	// immediately instead of waiting for someone to reconnect.
	conversationHandler := conversations.NewHandler(conversationService, realtimeHandler)
	messageHandler := messages.NewHandler(messageService, conversationService, hub, limiter)

	// realtimeHandler also satisfies servers.MembershipNotifier (same
	// method shape as conversations.MembershipNotifier), so a user added to
	// a server gets an immediate presence snapshot for each of its channels.
	serverService := servers.NewService(db, conversationService, realtimeHandler)
	serverHandler := servers.NewHandler(serverService, hub)

	mux := http.NewServeMux()

	mux.HandleFunc("POST /users", userHandler.Create)
	mux.Handle("GET /users", authHandler.RequireAuth(http.HandlerFunc(userHandler.List)))
	mux.Handle("GET /users/{id}", authHandler.RequireAuth(http.HandlerFunc(userHandler.Get)))
	mux.Handle("GET /users/{id}/avatar", authHandler.RequireAuth(http.HandlerFunc(userHandler.GetAvatar)))
	mux.HandleFunc("POST /login", authHandler.Login)
	mux.Handle("POST /logout", authHandler.RequireAuth(http.HandlerFunc(authHandler.Logout)))
	mux.Handle("GET /me", authHandler.RequireAuth(http.HandlerFunc(authHandler.Me)))
	mux.Handle("PATCH /me", authHandler.RequireAuth(http.HandlerFunc(userHandler.UpdateProfile)))
	mux.Handle("PATCH /me/password", authHandler.RequireAuth(http.HandlerFunc(userHandler.UpdatePassword)))
	mux.Handle("POST /me/avatar", authHandler.RequireAuth(http.HandlerFunc(userHandler.UploadAvatar)))
	mux.Handle("DELETE /me/avatar", authHandler.RequireAuth(http.HandlerFunc(userHandler.DeleteAvatar)))

	mux.Handle("GET /conversations", authHandler.RequireAuth(http.HandlerFunc(conversationHandler.List)))
	mux.Handle("POST /conversations", authHandler.RequireAuth(http.HandlerFunc(conversationHandler.Create)))
	mux.Handle("POST /conversations/{id}/members", authHandler.RequireAuth(http.HandlerFunc(conversationHandler.AddMember)))

	mux.Handle("POST /conversations/{id}/messages", authHandler.RequireAuth(http.HandlerFunc(messageHandler.Create)))
	mux.Handle("GET /conversations/{id}/messages", authHandler.RequireAuth(http.HandlerFunc(messageHandler.List)))
	mux.Handle("POST /conversations/{id}/messages/voice", authHandler.RequireAuth(http.HandlerFunc(messageHandler.CreateVoice)))
	mux.Handle("POST /conversations/{id}/messages/media", authHandler.RequireAuth(http.HandlerFunc(messageHandler.CreateMedia)))

	mux.Handle("PATCH /messages/{messageID}", authHandler.RequireAuth(http.HandlerFunc(messageHandler.Update)))
	mux.Handle("DELETE /messages/{messageID}", authHandler.RequireAuth(http.HandlerFunc(messageHandler.Delete)))
	mux.Handle("GET /messages/{messageID}/attachment", authHandler.RequireAuth(http.HandlerFunc(messageHandler.GetAttachment)))
	mux.Handle("POST /messages/{messageID}/reactions", authHandler.RequireAuth(http.HandlerFunc(messageHandler.AddReaction)))
	mux.Handle("DELETE /messages/{messageID}/reactions/{emoji}", authHandler.RequireAuth(http.HandlerFunc(messageHandler.RemoveReaction)))
	mux.Handle("GET /ws", authHandler.RequireAuth(http.HandlerFunc(realtimeHandler.Connect)))

	mux.Handle("POST /servers", authHandler.RequireAuth(http.HandlerFunc(serverHandler.Create)))
	mux.Handle("GET /servers", authHandler.RequireAuth(http.HandlerFunc(serverHandler.List)))
	mux.Handle("GET /servers/{id}", authHandler.RequireAuth(http.HandlerFunc(serverHandler.Get)))
	mux.Handle("DELETE /servers/{id}", authHandler.RequireAuth(http.HandlerFunc(serverHandler.DeleteServer)))
	mux.Handle("POST /servers/{id}/members", authHandler.RequireAuth(http.HandlerFunc(serverHandler.AddMember)))
	mux.Handle("DELETE /servers/{id}/members/{userID}", authHandler.RequireAuth(http.HandlerFunc(serverHandler.RemoveMember)))
	mux.Handle("POST /servers/{id}/members/{userID}/role", authHandler.RequireAuth(http.HandlerFunc(serverHandler.AssignRole)))
	mux.Handle("PATCH /servers/{id}", authHandler.RequireAuth(http.HandlerFunc(serverHandler.Update)))
	mux.Handle("POST /servers/{id}/icon", authHandler.RequireAuth(http.HandlerFunc(serverHandler.UploadIcon)))
	mux.Handle("GET /servers/{id}/icon", authHandler.RequireAuth(http.HandlerFunc(serverHandler.GetIcon)))
	mux.Handle("DELETE /servers/{id}/icon", authHandler.RequireAuth(http.HandlerFunc(serverHandler.DeleteIcon)))
	mux.Handle("POST /servers/{id}/banner", authHandler.RequireAuth(http.HandlerFunc(serverHandler.UploadBanner)))
	mux.Handle("GET /servers/{id}/banner", authHandler.RequireAuth(http.HandlerFunc(serverHandler.GetBanner)))
	mux.Handle("DELETE /servers/{id}/banner", authHandler.RequireAuth(http.HandlerFunc(serverHandler.DeleteBanner)))
	mux.Handle("POST /servers/{id}/roles", authHandler.RequireAuth(http.HandlerFunc(serverHandler.CreateRole)))
	mux.Handle("PATCH /servers/{id}/roles/{roleID}", authHandler.RequireAuth(http.HandlerFunc(serverHandler.UpdateRole)))
	mux.Handle("DELETE /servers/{id}/roles/{roleID}", authHandler.RequireAuth(http.HandlerFunc(serverHandler.DeleteRole)))
	mux.Handle("POST /servers/{id}/channels", authHandler.RequireAuth(http.HandlerFunc(serverHandler.CreateChannel)))
	mux.Handle("PATCH /servers/{id}/channels/reorder", authHandler.RequireAuth(http.HandlerFunc(serverHandler.ReorderChannels)))
	mux.Handle("DELETE /servers/{id}/channels/{channelID}", authHandler.RequireAuth(http.HandlerFunc(serverHandler.DeleteChannel)))

	log.Println("API listening on :8080")

	err = http.ListenAndServe(":8080", mux)
	if err != nil {
		log.Fatal(err)
	}
}
