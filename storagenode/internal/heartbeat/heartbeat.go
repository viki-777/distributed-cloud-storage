package heartbeat

import (
	"bytes"
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"

	pb "github.com/viki-777/distributed-cloud-storage/proto/dcs"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

type Heartbeater struct {
	nodeID          string
	coordinatorURL  string
	coordinatorGRPC string
	grpcAddress     string
	interval        time.Duration
	client          pb.NodeServiceClient
}

func NewHeartbeater(nodeID, coordinatorURL, coordinatorGRPC, grpcAddress string) *Heartbeater {
	return &Heartbeater{
		nodeID:          nodeID,
		coordinatorURL:  coordinatorURL,
		coordinatorGRPC: coordinatorGRPC,
		grpcAddress:     grpcAddress,
		interval:        5 * time.Second,
	}
}

func (h *Heartbeater) Start() {
	h.registerREST()

	// Connect to coordinator gRPC
	conn, err := grpc.Dial(h.coordinatorGRPC, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		log.Fatalf("failed to connect to coordinator gRPC: %v", err)
	}
	defer conn.Close()
	h.client = pb.NewNodeServiceClient(conn)

	ticker := time.NewTicker(h.interval)
	for range ticker.C {
		h.ping()
	}
}

func (h *Heartbeater) registerREST() {
	body, _ := json.Marshal(map[string]interface{}{
		"node_id":         h.nodeID,
		"address":         h.grpcAddress,
		"available_bytes": int64(5 * 1024 * 1024 * 1024),
	})

	for i := 0; i < 30; i++ {
		resp, err := http.Post(h.coordinatorURL+"/api/v1/nodes/register", "application/json", bytes.NewReader(body))
		if err == nil && resp.StatusCode < 300 {
			resp.Body.Close()
			log.Printf("Registered with coordinator REST as %s", h.nodeID)
			return
		}
		if resp != nil {
			resp.Body.Close()
		}
		log.Printf("Waiting for coordinator... attempt %d", i+1)
		time.Sleep(2 * time.Second)
	}
	log.Fatal("Could not register with coordinator via REST")
}

func (h *Heartbeater) ping() {
	req := &pb.HeartbeatRequest{
		NodeId:         h.nodeID,
		AvailableBytes: int64(5 * 1024 * 1024 * 1024), // TODO: get real available bytes
		UsedBytes:      0,                             // TODO: get real used bytes
	}
	resp, err := h.client.Heartbeat(context.Background(), req)
	if err != nil {
		log.Printf("Heartbeat gRPC failed: %v", err)
		return
	}
	if !resp.Accepted {
		log.Printf("Heartbeat rejected by coordinator: %s", resp.CoordinatorMsg)
	}
}
