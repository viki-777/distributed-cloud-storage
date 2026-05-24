package grpcserver

import (
	"context"
	"log"

	pb "github.com/viki-777/distributed-cloud-storage/proto/dcs"
	"github.com/viki-777/distributed-cloud-storage/storagenode/internal/chunkstore"
	"github.com/viki-777/distributed-cloud-storage/storagenode/internal/metrics"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

type NodeServer struct {
	pb.UnimplementedNodeServiceServer
	store *chunkstore.ChunkStore
}

func NewNodeServer(store *chunkstore.ChunkStore) *NodeServer {
	return &NodeServer{store: store}
}

// Heartbeat is implemented on the coordinator, not the storage node.
func (s *NodeServer) Heartbeat(ctx context.Context, req *pb.HeartbeatRequest) (*pb.HeartbeatResponse, error) {
	return nil, nil
}

// ReplicateChunk is called by the coordinator to instruct this node to pull a chunk from another node
func (s *NodeServer) ReplicateChunk(ctx context.Context, req *pb.ReplicateRequest) (*pb.ReplicateResponse, error) {
	log.Printf("Received ReplicateChunk command for chunk %s from source %s", req.ChunkId, req.SourceNode)

	// Dial the source node
	conn, err := grpc.Dial(req.SourceNode, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		log.Printf("Failed to dial source node %s: %v", req.SourceNode, err)
		return &pb.ReplicateResponse{Success: false}, err
	}
	defer conn.Close()

	client := pb.NewChunkServiceClient(conn)
	resp, err := client.DownloadChunk(ctx, &pb.DownloadChunkRequest{ChunkId: req.ChunkId})
	if err != nil {
		log.Printf("Failed to download chunk %s from %s: %v", req.ChunkId, req.SourceNode, err)
		return &pb.ReplicateResponse{Success: false}, err
	}

	// Write chunk to local store
	if err := s.store.Write(req.ChunkId, resp.Data, resp.Checksum); err != nil {
		log.Printf("Failed to store replicated chunk %s: %v", req.ChunkId, err)
		metrics.GrpcRequests.WithLabelValues("ReplicateChunk", "error").Inc()
		return &pb.ReplicateResponse{Success: false}, err
	}

	log.Printf("Successfully replicated chunk %s", req.ChunkId)
	metrics.GrpcRequests.WithLabelValues("ReplicateChunk", "success").Inc()
	return &pb.ReplicateResponse{Success: true}, nil
}
