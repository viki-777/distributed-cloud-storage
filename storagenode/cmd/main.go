package main

import (
	"context"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"

	"github.com/prometheus/client_golang/prometheus/promhttp"
	"google.golang.org/grpc"
	pb "github.com/viki-777/distributed-cloud-storage/proto/dcs"
	"github.com/viki-777/distributed-cloud-storage/storagenode/internal/chunkstore"
	"github.com/viki-777/distributed-cloud-storage/storagenode/internal/grpcserver"
	"github.com/viki-777/distributed-cloud-storage/storagenode/internal/heartbeat"
	"github.com/viki-777/distributed-cloud-storage/storagenode/internal/integrity"
	"github.com/viki-777/distributed-cloud-storage/storagenode/internal/metrics"
)

func main() {
	nodeID := os.Getenv("NODE_ID")
	if nodeID == "" {
		nodeID = "node-001"
	}
	grpcPort := os.Getenv("GRPC_PORT")
	if grpcPort == "" {
		grpcPort = "50051"
	}
	coordinatorURL := os.Getenv("COORDINATOR_URL")
	if coordinatorURL == "" {
		coordinatorURL = "http://localhost:8080"
	}
	coordinatorGRPC := os.Getenv("COORDINATOR_GRPC_URL")
	if coordinatorGRPC == "" {
		coordinatorGRPC = "localhost:50050"
	}
	storageDir := os.Getenv("STORAGE_DIR")
	if storageDir == "" {
		storageDir = "./data/chunks"
	}

	store, err := chunkstore.NewChunkStore(storageDir)
	if err != nil {
		log.Fatalf("failed to init chunk store: %v", err)
	}

	grpcAddr := fmt.Sprintf("%s:%s", nodeID, grpcPort)
	hb := heartbeat.NewHeartbeater(nodeID, coordinatorURL, coordinatorGRPC, grpcAddr, storageDir)
	go hb.Start()

	checker := integrity.NewChecker(nodeID, coordinatorURL, store)
	go checker.RunPeriodic(context.Background())

	// Start Prometheus metrics background updater
	metrics.StartMetricsUpdater(context.Background(), store)

	// Expose Prometheus metrics on port 9091
	go func() {
		metricsMux := http.NewServeMux()
		metricsMux.Handle("/metrics", promhttp.Handler())
		log.Printf("Storage node metrics server starting on :9091")
		if err := http.ListenAndServe(":9091", metricsMux); err != nil {
			log.Fatalf("metrics server failed: %v", err)
		}
	}()

	lis, err := net.Listen("tcp", fmt.Sprintf(":%s", grpcPort))
	if err != nil {
		log.Fatalf("failed to listen: %v", err)
	}

	s := grpc.NewServer(
		grpc.MaxRecvMsgSize(1024*1024*100), // 100 MB
		grpc.MaxSendMsgSize(1024*1024*100), // 100 MB
	)
	pb.RegisterChunkServiceServer(s, grpcserver.NewChunkServer(store))
	pb.RegisterNodeServiceServer(s, grpcserver.NewNodeServer(store))

	log.Printf("Storage Node %s starting gRPC on :%s", nodeID, grpcPort)
	if err := s.Serve(lis); err != nil {
		log.Fatalf("failed to serve: %v", err)
	}
}
