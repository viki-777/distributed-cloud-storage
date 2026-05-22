package replication

import (
	"context"
	"log"

	"github.com/viki-777/distributed-cloud-storage/coordinator/internal/metadata"
	"github.com/viki-777/distributed-cloud-storage/coordinator/internal/models"
	"github.com/viki-777/distributed-cloud-storage/coordinator/internal/registry"
	pb "github.com/viki-777/distributed-cloud-storage/proto/dcs"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

const ReplicationFactor = 3

type Healer struct {
	metadata *metadata.Service
	registry *registry.Service
}

func NewHealer(m *metadata.Service, r *registry.Service) *Healer {
	return &Healer{metadata: m, registry: r}
}

func (h *Healer) TriggerHeal(ctx context.Context, deadNodeID string) {
	log.Printf("Healer triggered for dead node %s", deadNodeID)
	
	// Mark chunk locations for the dead node as 'corrupted' or similar so they don't count
	// Actually, the DB query for HealthyLocationsForChunk only checks cl.status='healthy' AND n.status='active'.
	// Since node is 'dead', it won't be counted.
	
	orphanedChunks, err := h.metadata.ChunksOnNode(ctx, deadNodeID)
	if err != nil {
		log.Printf("Healer failed to get orphaned chunks: %v", err)
		return
	}

	for _, chunkID := range orphanedChunks {
		locations, err := h.metadata.HealthyLocationsForChunk(ctx, chunkID)
		if err != nil {
			log.Printf("Healer failed to get healthy locations for chunk %s: %v", chunkID, err)
			continue
		}

		if len(locations) >= ReplicationFactor {
			continue // Still healthy enough
		}

		if len(locations) == 0 {
			log.Printf("CRITICAL: chunk %s is completely lost!", chunkID)
			continue
		}

		needed := ReplicationFactor - len(locations)
		targets := h.pickNewNodes(ctx, locations, needed)

		source := locations[0]

		for _, target := range targets {
			log.Printf("Instructing node %s to replicate chunk %s to target node %s", source.ID, chunkID, target.ID)
			
			// Connect to target node and tell it to pull from source
			// Wait, the RPC `ReplicateChunk` tells the target node to pull from source
			// So we connect to the TARGET node.
			conn, err := grpc.Dial(target.Address, grpc.WithTransportCredentials(insecure.NewCredentials()))
			if err != nil {
				log.Printf("Healer failed to dial target node %s: %v", target.ID, err)
				continue
			}
			client := pb.NewNodeServiceClient(conn)
			
			_, err = client.ReplicateChunk(ctx, &pb.ReplicateRequest{
				ChunkId:    chunkID,
				SourceNode: source.Address,
			})
			conn.Close()

			if err != nil {
				log.Printf("Healer failed to send ReplicateChunk to %s: %v", target.ID, err)
				continue
			}

			if err := h.metadata.AddChunkLocation(ctx, chunkID, target.ID); err != nil {
				log.Printf("Healer failed to record new location for chunk %s: %v", chunkID, err)
			}
		}
	}
}

func (h *Healer) pickNewNodes(ctx context.Context, currentLocations []models.Node, needed int) []models.Node {
	allNodes, err := h.registry.HealthyNodes(ctx)
	if err != nil {
		return nil
	}

	hasMap := make(map[string]bool)
	for _, n := range currentLocations {
		hasMap[n.ID] = true
	}

	var targets []models.Node
	for _, n := range allNodes {
		if !hasMap[n.ID] {
			targets = append(targets, n)
			if len(targets) == needed {
				break
			}
		}
	}
	return targets
}
