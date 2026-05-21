package heartbeat

import (
	"bytes"
	"encoding/json"
	"log"
	"net/http"
	"time"
)

type Heartbeater struct {
	nodeID         string
	coordinatorURL string
	grpcAddress    string
	interval       time.Duration
}

func NewHeartbeater(nodeID, coordinatorURL, grpcAddress string) *Heartbeater {
	return &Heartbeater{
		nodeID:         nodeID,
		coordinatorURL: coordinatorURL,
		grpcAddress:    grpcAddress,
		interval:       5 * time.Second,
	}
}

func (h *Heartbeater) Start() {
	h.register()

	ticker := time.NewTicker(h.interval)
	for range ticker.C {
		h.ping()
	}
}

func (h *Heartbeater) register() {
	body, _ := json.Marshal(map[string]interface{}{
		"node_id":         h.nodeID,
		"address":         h.grpcAddress,
		"available_bytes": int64(5 * 1024 * 1024 * 1024),
	})

	for i := 0; i < 30; i++ {
		resp, err := http.Post(h.coordinatorURL+"/api/v1/nodes/register", "application/json", bytes.NewReader(body))
		if err == nil && resp.StatusCode < 300 {
			resp.Body.Close()
			log.Printf("Registered with coordinator as %s", h.nodeID)
			return
		}
		if resp != nil {
			resp.Body.Close()
		}
		log.Printf("Waiting for coordinator... attempt %d", i+1)
		time.Sleep(2 * time.Second)
	}
	log.Fatal("Could not register with coordinator")
}

func (h *Heartbeater) ping() {
	body, _ := json.Marshal(map[string]interface{}{
		"node_id":         h.nodeID,
		"address":         h.grpcAddress,
		"available_bytes": int64(5 * 1024 * 1024 * 1024),
	})
	resp, err := http.Post(h.coordinatorURL+"/api/v1/nodes/register", "application/json", bytes.NewReader(body))
	if err != nil {
		log.Printf("Heartbeat failed: %v", err)
		return
	}
	resp.Body.Close()
}
