package metrics

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	ActiveNodes = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "dcs_active_nodes_total",
		Help: "Total number of active storage nodes",
	})
	
	TotalChunks = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "dcs_chunks_total",
		Help: "Total number of distinct chunks in the cluster",
	})

	UnderReplicated = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "dcs_under_replicated_chunks",
		Help: "Number of chunks that have fewer than 3 healthy replicas",
	})

	UploadOps = promauto.NewCounter(prometheus.CounterOpts{
		Name: "dcs_upload_operations_total",
		Help: "Total number of file upload operations initiated",
	})

	HealEvents = promauto.NewCounter(prometheus.CounterOpts{
		Name: "dcs_heal_events_total",
		Help: "Total number of chunk healing/replication events triggered",
	})
)

// StartMetricsUpdater runs a background goroutine to update gauges periodically
func StartMetricsUpdater(ctx context.Context, db *pgxpool.Pool) {
	ticker := time.NewTicker(10 * time.Second)
	go func() {
		for {
			select {
			case <-ctx.Done():
				ticker.Stop()
				return
			case <-ticker.C:
				updateMetrics(ctx, db)
			}
		}
	}()
}

func updateMetrics(ctx context.Context, db *pgxpool.Pool) {
	// Update active nodes
	var active int
	err := db.QueryRow(ctx, "SELECT COUNT(*) FROM nodes WHERE status = 'active'").Scan(&active)
	if err == nil {
		ActiveNodes.Set(float64(active))
	}

	// Update total chunks
	var chunks int
	err = db.QueryRow(ctx, "SELECT COUNT(*) FROM chunks").Scan(&chunks)
	if err == nil {
		TotalChunks.Set(float64(chunks))
	}

	// Update under-replicated chunks
	// A chunk is under-replicated if the count of its healthy locations is < 3
	var underRep int
	err = db.QueryRow(ctx, `
		SELECT COUNT(*) FROM (
			SELECT chunk_id FROM chunk_locations 
			WHERE status = 'healthy' 
			GROUP BY chunk_id 
			HAVING COUNT(node_id) < 3
		) sub
	`).Scan(&underRep)
	if err == nil {
		UnderReplicated.Set(float64(underRep))
	}
}
