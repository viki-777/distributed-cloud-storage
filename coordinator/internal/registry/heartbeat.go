package registry

import (
	"context"
	"time"
)

// HandleHeartbeat sets the Redis TTL and updates the node stats in PostgreSQL
func (s *Service) HandleHeartbeat(ctx context.Context, nodeID string, availableBytes, usedBytes int64) error {
	// Set Redis key with 15s TTL
	err := s.redis.Set(ctx, "node:alive:"+nodeID, "1", 15*time.Second).Err()
	if err != nil {
		return err
	}

	// Update node in Postgres (it might already exist from registration)
	_, err = s.db.Exec(ctx,
		`UPDATE nodes SET available_bytes = $1, used_bytes = $2, last_heartbeat = NOW(), status = 'active' WHERE id = $3`,
		availableBytes, usedBytes, nodeID,
	)
	return err
}

// MarkNodeDead marks a node as dead in PostgreSQL
func (s *Service) MarkNodeDead(ctx context.Context, nodeID string) error {
	_, err := s.db.Exec(ctx,
		`UPDATE nodes SET status = 'dead' WHERE id = $1`,
		nodeID,
	)
	return err
}
