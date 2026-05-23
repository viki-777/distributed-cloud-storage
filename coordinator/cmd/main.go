package main

import (
	"context"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/redis/go-redis/v9"
	"github.com/viki-777/distributed-cloud-storage/coordinator/internal/api"
	"github.com/viki-777/distributed-cloud-storage/coordinator/internal/grpcserver"
	"github.com/viki-777/distributed-cloud-storage/coordinator/internal/metadata"
	"github.com/viki-777/distributed-cloud-storage/coordinator/internal/metrics"
	"github.com/viki-777/distributed-cloud-storage/coordinator/internal/registry"
	"github.com/viki-777/distributed-cloud-storage/coordinator/internal/replication"
	pb "github.com/viki-777/distributed-cloud-storage/proto/dcs"
	"google.golang.org/grpc"
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
	grpcPort := os.Getenv("GRPC_PORT")
	if grpcPort == "" {
		grpcPort = "50050"
	}
	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		redisURL = "redis://localhost:6379/0"
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

	redisOpt, err := redis.ParseURL(redisURL)
	if err != nil {
		log.Fatalf("invalid redis url: %v", err)
	}
	rdb := redis.NewClient(redisOpt)
	log.Println("Connected to Redis")

	metadataSvc := metadata.NewService(pool)
	registrySvc := registry.NewService(pool, rdb)
	healerSvc := replication.NewHealer(metadataSvc, registrySvc)

	watcher := registry.NewWatcher(registrySvc, healerSvc)
	go watcher.Watch(ctx)

	// Start Prometheus metrics background updater
	metrics.StartMetricsUpdater(ctx, pool)

	// Expose Prometheus metrics on port 9090
	go func() {
		metricsMux := http.NewServeMux()
		metricsMux.Handle("/metrics", promhttp.Handler())
		log.Printf("Coordinator metrics server starting on :9090")
		if err := http.ListenAndServe(":9090", metricsMux); err != nil {
			log.Fatalf("metrics server failed: %v", err)
		}
	}()

	handler := api.NewHandler(metadataSvc, registrySvc, healerSvc)
	router := api.NewRouter(handler)

	// Start gRPC server
	go func() {
		lis, err := net.Listen("tcp", fmt.Sprintf(":%s", grpcPort))
		if err != nil {
			log.Fatalf("failed to listen on gRPC port: %v", err)
		}
		s := grpc.NewServer()
		pb.RegisterNodeServiceServer(s, grpcserver.NewNodeServer(registrySvc))
		log.Printf("Coordinator gRPC server listening on %v", lis.Addr())
		if err := s.Serve(lis); err != nil {
			log.Fatalf("failed to serve gRPC: %v", err)
		}
	}()

	addr := fmt.Sprintf(":%s", port)
	log.Printf("Coordinator REST API starting on %s", addr)
	if err := http.ListenAndServe(addr, router); err != nil {
		log.Fatalf("server failed: %v", err)
	}
}
