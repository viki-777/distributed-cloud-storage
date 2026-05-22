package integrity

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/viki-777/distributed-cloud-storage/storagenode/internal/chunkstore"
)

type Checker struct {
	nodeID         string
	coordinatorURL string
	store          *chunkstore.ChunkStore
}

func NewChecker(nodeID, coordinatorURL string, store *chunkstore.ChunkStore) *Checker {
	return &Checker{
		nodeID:         nodeID,
		coordinatorURL: coordinatorURL,
		store:          store,
	}
}

func (c *Checker) RunPeriodic(ctx context.Context) {
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			c.verifyAll()
		}
	}
}

func (c *Checker) verifyAll() {
	chunks := c.store.ListAllChunks()
	for _, chunkID := range chunks {
		data, storedChecksum, err := c.store.Read(chunkID)
		if err != nil {
			log.Printf("Checker failed to read chunk %s: %v", chunkID, err)
			continue
		}

		h := sha256.Sum256(data)
		computed := hex.EncodeToString(h[:])

		if storedChecksum != "" && computed != storedChecksum {
			log.Printf("CORRUPTION DETECTED: chunk %s", chunkID)
			c.reportCorruption(chunkID)
		}
	}
}

func (c *Checker) reportCorruption(chunkID string) {
	body, _ := json.Marshal(map[string]interface{}{
		"node_id": c.nodeID,
	})
	
	url := c.coordinatorURL + "/api/v1/chunks/" + chunkID + "/corrupted"
	resp, err := http.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		log.Printf("Failed to report corruption for chunk %s: %v", chunkID, err)
		return
	}
	defer resp.Body.Close()
	
	if resp.StatusCode >= 300 {
		log.Printf("Coordinator rejected corruption report for chunk %s: status %d", chunkID, resp.StatusCode)
	}
}
