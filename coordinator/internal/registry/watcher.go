package registry

import (
	"context"
	"log"
	"time"
)

type Watcher struct {
	registry *Service
}

func NewWatcher(registry *Service) *Watcher {
	return &Watcher{registry: registry}
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
						// TODO: trigger healer here
						log.Printf("Watcher marked node %s as dead", node.ID)
					}
				}
			}
		}
	}
}
