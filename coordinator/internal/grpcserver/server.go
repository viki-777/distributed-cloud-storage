package grpcserver

import (
	"context"

	pb "github.com/viki-777/distributed-cloud-storage/proto/dcs"
	"github.com/viki-777/distributed-cloud-storage/coordinator/internal/registry"
)

type NodeServer struct {
	pb.UnimplementedNodeServiceServer
	registry *registry.Service
}

func NewNodeServer(registry *registry.Service) *NodeServer {
	return &NodeServer{registry: registry}
}

func (s *NodeServer) Heartbeat(ctx context.Context, req *pb.HeartbeatRequest) (*pb.HeartbeatResponse, error) {
	err := s.registry.HandleHeartbeat(ctx, req.NodeId, req.AvailableBytes, req.UsedBytes)
	if err != nil {
		return &pb.HeartbeatResponse{Accepted: false, CoordinatorMsg: err.Error()}, nil
	}

	return &pb.HeartbeatResponse{Accepted: true, CoordinatorMsg: "ok"}, nil
}

// ReplicateChunk is unimplemented on the coordinator side, it's used by the coordinator to call the storage node
func (s *NodeServer) ReplicateChunk(ctx context.Context, req *pb.ReplicateRequest) (*pb.ReplicateResponse, error) {
	return nil, nil
}
