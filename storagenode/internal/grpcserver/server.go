package grpcserver

import (
	"context"
	"log"

	pb "github.com/viki-777/distributed-cloud-storage/proto/dcs"
	"github.com/viki-777/distributed-cloud-storage/storagenode/internal/chunkstore"
	"github.com/viki-777/distributed-cloud-storage/storagenode/internal/metrics"
)

type ChunkServer struct {
	pb.UnimplementedChunkServiceServer
	store *chunkstore.ChunkStore
}

func NewChunkServer(store *chunkstore.ChunkStore) *ChunkServer {
	return &ChunkServer{store: store}
}

func (s *ChunkServer) UploadChunk(ctx context.Context, req *pb.UploadChunkRequest) (*pb.UploadChunkResponse, error) {
	log.Printf("Receiving chunk: %s (%d bytes)", req.ChunkId, len(req.Data))

	if err := s.store.Write(req.ChunkId, req.Data, req.Checksum); err != nil {
		log.Printf("Failed to store chunk %s: %v", req.ChunkId, err)
		metrics.GrpcRequests.WithLabelValues("UploadChunk", "error").Inc()
		return &pb.UploadChunkResponse{Success: false, ChunkId: req.ChunkId}, err
	}

	log.Printf("Stored chunk: %s", req.ChunkId)
	metrics.GrpcRequests.WithLabelValues("UploadChunk", "success").Inc()
	return &pb.UploadChunkResponse{Success: true, ChunkId: req.ChunkId}, nil
}

func (s *ChunkServer) DownloadChunk(ctx context.Context, req *pb.DownloadChunkRequest) (*pb.DownloadChunkResponse, error) {
	log.Printf("Download request for chunk: %s", req.ChunkId)

	data, checksum, err := s.store.Read(req.ChunkId)
	if err != nil {
		metrics.GrpcRequests.WithLabelValues("DownloadChunk", "error").Inc()
		return nil, err
	}

	metrics.GrpcRequests.WithLabelValues("DownloadChunk", "success").Inc()
	return &pb.DownloadChunkResponse{Data: data, Checksum: checksum}, nil
}

func (s *ChunkServer) DeleteChunk(ctx context.Context, req *pb.DeleteChunkRequest) (*pb.DeleteChunkResponse, error) {
	err := s.store.Delete(req.ChunkId)
	if err != nil {
		metrics.GrpcRequests.WithLabelValues("DeleteChunk", "error").Inc()
	} else {
		metrics.GrpcRequests.WithLabelValues("DeleteChunk", "success").Inc()
	}
	return &pb.DeleteChunkResponse{Success: err == nil}, err
}

func (s *ChunkServer) VerifyChunk(ctx context.Context, req *pb.VerifyChunkRequest) (*pb.VerifyChunkResponse, error) {
	if !s.store.Exists(req.ChunkId) {
		metrics.GrpcRequests.WithLabelValues("VerifyChunk", "success").Inc()
		return &pb.VerifyChunkResponse{Exists: false}, nil
	}
	_, checksum, err := s.store.Read(req.ChunkId)
	if err != nil {
		metrics.GrpcRequests.WithLabelValues("VerifyChunk", "error").Inc()
		return &pb.VerifyChunkResponse{Exists: false}, err
	}
	metrics.GrpcRequests.WithLabelValues("VerifyChunk", "success").Inc()
	return &pb.VerifyChunkResponse{Exists: true, Checksum: checksum}, nil
}
