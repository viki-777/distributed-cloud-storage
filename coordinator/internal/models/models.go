package models

import "time"

type File struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	SizeBytes   int64     `json:"size_bytes"`
	ChunkSize   int       `json:"chunk_size"`
	TotalChunks int       `json:"total_chunks"`
	Checksum    string    `json:"checksum"`
	IsEncrypted bool      `json:"is_encrypted"`
	CreatedAt   time.Time `json:"created_at"`
	Status      string    `json:"status"`
}

type Chunk struct {
	ID         string `json:"id"`
	FileID     string `json:"file_id"`
	ChunkIndex int    `json:"chunk_index"`
	ChunkID    string `json:"chunk_id"`
	SizeBytes  int64  `json:"size_bytes"`
	Checksum   string `json:"checksum"`
}

type ChunkLocation struct {
	ID      string `json:"id"`
	ChunkID string `json:"chunk_id"`
	NodeID  string `json:"node_id"`
	Status  string `json:"status"`
}

type Node struct {
	ID             string    `json:"id"`
	Address        string    `json:"address"`
	AvailableBytes int64     `json:"available_bytes"`
	UsedBytes      int64     `json:"used_bytes"`
	Status         string    `json:"status"`
	LastHeartbeat  time.Time `json:"last_heartbeat"`
}

type UploadPlanEntry struct {
	ChunkIndex int      `json:"chunk_index"`
	ChunkID    string   `json:"chunk_id"`
	Nodes      []string `json:"nodes"`
}
