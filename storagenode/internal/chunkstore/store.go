package chunkstore

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
)

var ErrChecksumMismatch = errors.New("checksum mismatch")

type ChunkStore struct {
	baseDir string
}

func NewChunkStore(baseDir string) (*ChunkStore, error) {
	if err := os.MkdirAll(baseDir, 0755); err != nil {
		return nil, err
	}
	return &ChunkStore{baseDir: baseDir}, nil
}

func (s *ChunkStore) Write(chunkID string, data []byte, checksum string) error {
	computed := sha256hex(data)
	if checksum != "" && computed != checksum {
		return ErrChecksumMismatch
	}

	dir := filepath.Dir(s.chunkPath(chunkID))
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	path := s.chunkPath(chunkID)
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func (s *ChunkStore) Read(chunkID string) ([]byte, string, error) {
	data, err := os.ReadFile(s.chunkPath(chunkID))
	if err != nil {
		return nil, "", err
	}
	return data, sha256hex(data), nil
}

func (s *ChunkStore) Exists(chunkID string) bool {
	_, err := os.Stat(s.chunkPath(chunkID))
	return err == nil
}

func (s *ChunkStore) Delete(chunkID string) error {
	return os.Remove(s.chunkPath(chunkID))
}

func (s *ChunkStore) ListAllChunks() []string {
	var chunks []string
	filepath.WalkDir(s.baseDir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if !d.IsDir() && filepath.Ext(path) != ".tmp" {
			chunks = append(chunks, d.Name())
		}
		return nil
	})
	return chunks
}

func (s *ChunkStore) BaseDir() string {
	return s.baseDir
}

func (s *ChunkStore) chunkPath(chunkID string) string {
	if len(chunkID) < 2 {
		return filepath.Join(s.baseDir, chunkID)
	}
	return filepath.Join(s.baseDir, chunkID[:2], chunkID)
}

func sha256hex(data []byte) string {
	h := sha256.Sum256(data)
	return hex.EncodeToString(h[:])
}
