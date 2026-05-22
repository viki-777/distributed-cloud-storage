package metadata

import (
	"context"
	"sort"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/viki-777/distributed-cloud-storage/coordinator/internal/models"
)

type Service struct {
	db *pgxpool.Pool
}

func NewService(db *pgxpool.Pool) *Service {
	return &Service{db: db}
}

func (s *Service) RegisterFile(ctx context.Context, name string, sizeBytes int64, totalChunks int, checksum string) (*models.File, error) {
	var file models.File
	err := s.db.QueryRow(ctx,
		`INSERT INTO files (name, size_bytes, total_chunks, checksum) 
		 VALUES ($1, $2, $3, $4) 
		 RETURNING id, name, size_bytes, chunk_size, total_chunks, checksum, created_at, status`,
		name, sizeBytes, totalChunks, checksum,
	).Scan(&file.ID, &file.Name, &file.SizeBytes, &file.ChunkSize, &file.TotalChunks, &file.Checksum, &file.CreatedAt, &file.Status)
	return &file, err
}

func (s *Service) GetFile(ctx context.Context, fileID string) (*models.File, error) {
	var file models.File
	err := s.db.QueryRow(ctx,
		`SELECT id, name, size_bytes, chunk_size, total_chunks, checksum, created_at, status 
		 FROM files WHERE id = $1`,
		fileID,
	).Scan(&file.ID, &file.Name, &file.SizeBytes, &file.ChunkSize, &file.TotalChunks, &file.Checksum, &file.CreatedAt, &file.Status)
	return &file, err
}

func (s *Service) RegisterChunk(ctx context.Context, fileID string, chunkIndex int, chunkID string, sizeBytes int64, checksum string) error {
	_, err := s.db.Exec(ctx,
		`INSERT INTO chunks (file_id, chunk_index, chunk_id, size_bytes, checksum) 
		 VALUES ($1, $2, $3, $4, $5)`,
		fileID, chunkIndex, chunkID, sizeBytes, checksum,
	)
	return err
}

func (s *Service) AddChunkLocation(ctx context.Context, chunkID, nodeID string) error {
	_, err := s.db.Exec(ctx,
		`INSERT INTO chunk_locations (chunk_id, node_id) VALUES ($1, $2)`,
		chunkID, nodeID,
	)
	return err
}

func (s *Service) GetChunkLocations(ctx context.Context, fileID string) ([]models.UploadPlanEntry, error) {
	rows, err := s.db.Query(ctx,
		`SELECT c.chunk_index, c.chunk_id, cl.node_id, n.address 
		 FROM chunks c
		 JOIN chunk_locations cl ON c.chunk_id = cl.chunk_id
		 JOIN nodes n ON cl.node_id = n.id
		 WHERE c.file_id = $1 AND cl.status = 'healthy'
		 ORDER BY c.chunk_index`,
		fileID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	planMap := make(map[int]*models.UploadPlanEntry)
	for rows.Next() {
		var chunkIndex int
		var chunkID, nodeID, nodeAddr string
		if err := rows.Scan(&chunkIndex, &chunkID, &nodeID, &nodeAddr); err != nil {
			return nil, err
		}
		if _, ok := planMap[chunkIndex]; !ok {
			planMap[chunkIndex] = &models.UploadPlanEntry{
				ChunkIndex: chunkIndex,
				ChunkID:    chunkID,
			}
		}
		planMap[chunkIndex].Nodes = append(planMap[chunkIndex].Nodes, nodeAddr)
	}

	var plan []models.UploadPlanEntry
	for _, entry := range planMap {
		plan = append(plan, *entry)
	}
	sort.Slice(plan, func(i, j int) bool {
		return plan[i].ChunkIndex < plan[j].ChunkIndex
	})
	return plan, nil
}

func (s *Service) ChunksOnNode(ctx context.Context, nodeID string) ([]string, error) {
	rows, err := s.db.Query(ctx,
		`SELECT chunk_id FROM chunk_locations WHERE node_id = $1 AND status = 'healthy'`,
		nodeID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var chunks []string
	for rows.Next() {
		var chunkID string
		if err := rows.Scan(&chunkID); err != nil {
			return nil, err
		}
		chunks = append(chunks, chunkID)
	}
	return chunks, nil
}

func (s *Service) HealthyLocationsForChunk(ctx context.Context, chunkID string) ([]models.Node, error) {
	rows, err := s.db.Query(ctx,
		`SELECT n.id, n.address, n.available_bytes, n.used_bytes, n.status, n.last_heartbeat 
		 FROM nodes n
		 JOIN chunk_locations cl ON n.id = cl.node_id
		 WHERE cl.chunk_id = $1 AND cl.status = 'healthy' AND n.status = 'active'`,
		chunkID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var nodes []models.Node
	for rows.Next() {
		var n models.Node
		if err := rows.Scan(&n.ID, &n.Address, &n.AvailableBytes, &n.UsedBytes, &n.Status, &n.LastHeartbeat); err != nil {
			return nil, err
		}
		nodes = append(nodes, n)
	}
	return nodes, nil
}

func (s *Service) MarkChunkCorrupted(ctx context.Context, chunkID, nodeID string) error {
	_, err := s.db.Exec(ctx,
		`UPDATE chunk_locations SET status = 'corrupted' WHERE chunk_id = $1 AND node_id = $2`,
		chunkID, nodeID,
	)
	return err
}
