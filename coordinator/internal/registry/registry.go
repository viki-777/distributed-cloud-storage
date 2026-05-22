package registry

import (
	"context"
	"fmt"
	"sort"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/viki-777/distributed-cloud-storage/coordinator/internal/models"
)

type Service struct {
	db    *pgxpool.Pool
	redis *redis.Client
}

func NewService(db *pgxpool.Pool, rdb *redis.Client) *Service {
	return &Service{db: db, redis: rdb}
}

func (s *Service) RegisterNode(ctx context.Context, nodeID, address string, availableBytes int64) error {
	_, err := s.db.Exec(ctx,
		`INSERT INTO nodes (id, address, available_bytes, used_bytes, status) 
		 VALUES ($1, $2, $3, 0, 'active')
		 ON CONFLICT (id) DO UPDATE SET address = $2, available_bytes = $3, status = 'active', last_heartbeat = NOW()`,
		nodeID, address, availableBytes,
	)
	return err
}

func (s *Service) MarkNodeDraining(ctx context.Context, nodeID string) error {
	_, err := s.db.Exec(ctx,
		`UPDATE nodes SET status = 'draining' WHERE id = $1`,
		nodeID,
	)
	return err
}

func (s *Service) HealthyNodes(ctx context.Context) ([]models.Node, error) {
	rows, err := s.db.Query(ctx,
		`SELECT id, address, available_bytes, used_bytes, status, last_heartbeat 
		 FROM nodes WHERE status = 'active' ORDER BY available_bytes DESC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var nodes []models.Node
	for rows.Next() {
		var n models.Node
		if err := rows.Scan(&n.ID, &n.Address, &n.AvailableBytes, &n.UsedBytes, &n.Status, &n.LastHeartbeat); err != nil {
			return nil, err
		}
		nodes = append(nodes, n)
	}
	return nodes, nil
}

func (s *Service) AllNodes(ctx context.Context) ([]models.Node, error) {
	rows, err := s.db.Query(ctx,
		`SELECT id, address, available_bytes, used_bytes, status, last_heartbeat FROM nodes`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var nodes []models.Node
	for rows.Next() {
		var n models.Node
		if err := rows.Scan(&n.ID, &n.Address, &n.AvailableBytes, &n.UsedBytes, &n.Status, &n.LastHeartbeat); err != nil {
			return nil, err
		}
		nodes = append(nodes, n)
	}
	return nodes, nil
}

// PickNodesForChunk selects N healthy nodes for a chunk
func (s *Service) PickNodesForChunk(ctx context.Context, replicationFactor int) ([]models.Node, error) {
	nodes, err := s.HealthyNodes(ctx)
	if err != nil {
		return nil, err
	}
	if len(nodes) < replicationFactor {
		return nil, fmt.Errorf("not enough healthy nodes: have %d, need %d", len(nodes), replicationFactor)
	}
	sort.Slice(nodes, func(i, j int) bool {
		return nodes[i].AvailableBytes > nodes[j].AvailableBytes
	})
	return nodes[:replicationFactor], nil
}
