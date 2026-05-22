package registry

import (
	"context"
	"log"
	"time"
)

type Healer interface {
	TriggerHeal(ctx context.Context, deadNodeID string)
}

type Watcher struct {
	registry *Service
	healer   Healer
}

func NewWatcher(registry *Service, healer Healer) *Watcher {
	return &Watcher{registry: registry, healer: healer}
}

func (w *Watcher) Watch(ctx context.Context) {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			nodes, err := w.registry.HealthyNodes(ctx)
			if err != nil {
				log.Printf("Watcher error getting healthy nodes: %v", err)
				continue
			}

			for _, node := range nodes {
				exists, err := w.registry.redis.Exists(ctx, "node:alive:"+node.ID).Result()
				if err != nil {
					log.Printf("Watcher error checking redis for node %s: %v", node.ID, err)
					continue
				}

				if exists == 0 {
					log.Printf("Node %s appears dead (Redis TTL expired)", node.ID)
					if err := w.registry.MarkNodeDead(ctx, node.ID); err != nil {
						log.Printf("Watcher failed to mark node %s dead: %v", node.ID, err)
					} else {
						w.healer.TriggerHeal(ctx, node.ID)
						log.Printf("Watcher marked node %s as dead and triggered healer", node.ID)
					}
				}
			}
		}
	}
}
