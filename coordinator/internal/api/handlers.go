package api

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/viki-777/distributed-cloud-storage/coordinator/internal/metadata"
	"github.com/viki-777/distributed-cloud-storage/coordinator/internal/registry"
)

const ReplicationFactor = 3

type Handler struct {
	metadata *metadata.Service
	registry *registry.Service
}

func NewHandler(m *metadata.Service, r *registry.Service) *Handler {
	return &Handler{metadata: m, registry: r}
}

// POST /api/v1/files/register
func (h *Handler) RegisterFile(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name        string `json:"name"`
		SizeBytes   int64  `json:"size_bytes"`
		TotalChunks int    `json:"total_chunks"`
		Checksum    string `json:"checksum"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	ctx := r.Context()

	file, err := h.metadata.RegisterFile(ctx, req.Name, req.SizeBytes, req.TotalChunks, req.Checksum)
	if err != nil {
		log.Printf("error registering file: %v", err)
		http.Error(w, "failed to register file", http.StatusInternalServerError)
		return
	}

	uploadPlan := make([]map[string]interface{}, req.TotalChunks)
	for i := 0; i < req.TotalChunks; i++ {
		nodes, err := h.registry.PickNodesForChunk(ctx, ReplicationFactor)
		if err != nil {
			log.Printf("error picking nodes: %v", err)
			http.Error(w, fmt.Sprintf("not enough nodes: %v", err), http.StatusServiceUnavailable)
			return
		}
		chunkID := fmt.Sprintf("%s-chunk-%d", file.ID, i)

		h.metadata.RegisterChunk(ctx, file.ID, i, chunkID, int64(file.ChunkSize), "")

		nodeAddrs := make([]string, len(nodes))
		for j, n := range nodes {
			nodeAddrs[j] = n.Address
		}

		uploadPlan[i] = map[string]interface{}{
			"chunk_index": i,
			"chunk_id":    chunkID,
			"nodes":       nodeAddrs,
		}
	}

	resp := map[string]interface{}{
		"file_id":     file.ID,
		"upload_plan": uploadPlan,
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// GET /api/v1/files/{fileID}
func (h *Handler) GetFile(w http.ResponseWriter, r *http.Request) {
	fileID := chi.URLParam(r, "fileID")
	ctx := r.Context()

	file, err := h.metadata.GetFile(ctx, fileID)
	if err != nil {
		http.Error(w, "file not found", http.StatusNotFound)
		return
	}

	downloadPlan, err := h.metadata.GetChunkLocations(ctx, fileID)
	if err != nil {
		log.Printf("error getting chunk locations: %v", err)
		http.Error(w, "failed to build download plan", http.StatusInternalServerError)
		return
	}

	resp := map[string]interface{}{
		"file":          file,
		"download_plan": downloadPlan,
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// POST /api/v1/files/{fileID}/chunks/{chunkID}/confirm
func (h *Handler) ConfirmChunk(w http.ResponseWriter, r *http.Request) {
	_ = chi.URLParam(r, "fileID")
	chunkID := chi.URLParam(r, "chunkID")

	var req struct {
		NodeID   string `json:"node_id"`
		Checksum string `json:"checksum"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	ctx := r.Context()
	if err := h.metadata.AddChunkLocation(ctx, chunkID, req.NodeID); err != nil {
		log.Printf("error confirming chunk: %v", err)
		http.Error(w, "failed to confirm chunk", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "confirmed"})
}

// GET /api/v1/nodes
func (h *Handler) ListNodes(w http.ResponseWriter, r *http.Request) {
	nodes, err := h.registry.AllNodes(r.Context())
	if err != nil {
		http.Error(w, "failed to list nodes", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(nodes)
}

// POST /api/v1/nodes/register
func (h *Handler) RegisterNode(w http.ResponseWriter, r *http.Request) {
	var req struct {
		NodeID         string `json:"node_id"`
		Address        string `json:"address"`
		AvailableBytes int64  `json:"available_bytes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if err := h.registry.RegisterNode(r.Context(), req.NodeID, req.Address, req.AvailableBytes); err != nil {
		log.Printf("error registering node: %v", err)
		http.Error(w, "failed to register node", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"status": "registered", "node_id": req.NodeID})
}

// GET /api/v1/health
func (h *Handler) HealthCheck(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}
