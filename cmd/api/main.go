package main

import (
	"context"
	"log"
	"net/http"

	"github.com/bu3lii/bu3li-comms/internal/auth"
	"github.com/bu3lii/bu3li-comms/internal/platform"
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

	mux := http.NewServeMux()

	mux.HandleFunc("POST /users", userHandler.Create)
	mux.HandleFunc("POST /login", authHandler.Login)
	mux.HandleFunc("GET /me", authHandler.Me)
	mux.HandleFunc("POST /logout", authHandler.Logout)

	log.Println("API listening on :8080")

	err = http.ListenAndServe(":8080", mux)
	if err != nil {
		log.Fatal(err)
	}
}
