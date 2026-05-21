package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/viki-777/distributed-cloud-storage/coordinator/internal/api"
	"github.com/viki-777/distributed-cloud-storage/coordinator/internal/metadata"
	"github.com/viki-777/distributed-cloud-storage/coordinator/internal/registry"
)

func main() {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://dcs:secret@localhost:5432/dcs_metadata"
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		log.Fatalf("unable to connect to database: %v", err)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		log.Fatalf("unable to ping database: %v", err)
	}
	log.Println("Connected to PostgreSQL")

	metadataSvc := metadata.NewService(pool)
	registrySvc := registry.NewService(pool)

	handler := api.NewHandler(metadataSvc, registrySvc)
	router := api.NewRouter(handler)

	addr := fmt.Sprintf(":%s", port)
	log.Printf("Coordinator starting on %s", addr)
	if err := http.ListenAndServe(addr, router); err != nil {
		log.Fatalf("server failed: %v", err)
	}
}
