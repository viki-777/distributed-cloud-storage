package metrics

import (
	"context"
	"syscall"
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

	DiskUsedBytes = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "dcs_node_disk_used_bytes",
		Help: "Total disk space used by the storage node",
	})

	DiskFreeBytes = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "dcs_node_disk_free_bytes",
		Help: "Total disk space available to the storage node",
	})

	GrpcRequests = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "dcs_grpc_requests_total",
		Help: "Total number of gRPC requests handled by this node",
	}, []string{"method", "status"})
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

	// Update disk usage
	var stat syscall.Statfs_t
	// We can use the chunk store base directory to get the stats of the filesystem it resides on
	if err := syscall.Statfs(store.BaseDir(), &stat); err == nil {
		total := stat.Blocks * uint64(stat.Bsize)
		free := stat.Bavail * uint64(stat.Bsize)
		used := total - free
		
		DiskUsedBytes.Set(float64(used))
		DiskFreeBytes.Set(float64(free))
	}
}
