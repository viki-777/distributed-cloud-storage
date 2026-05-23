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
}
