package metrics

import (
	"context"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/viki-777/distributed-cloud-storage/storagenode/internal/chunkstore"
)

var (
	ChunksStored = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "dcs_node_chunks_stored",
		Help: "Total number of chunks stored on this node",
	})
)

// StartMetricsUpdater runs a background goroutine to update gauges periodically
func StartMetricsUpdater(ctx context.Context, store *chunkstore.ChunkStore) {
	ticker := time.NewTicker(10 * time.Second)
	go func() {
		for {
			select {
			case <-ctx.Done():
				ticker.Stop()
				return
			case <-ticker.C:
				updateMetrics(store)
			}
		}
	}()
}

func updateMetrics(store *chunkstore.ChunkStore) {
	// Update total chunks stored
	chunks := store.ListAllChunks()
	ChunksStored.Set(float64(len(chunks)))
}
