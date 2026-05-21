-- Distributed Cloud Storage — Initial Schema

CREATE TABLE files (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  size_bytes  BIGINT NOT NULL,
  chunk_size  INT NOT NULL DEFAULT 67108864,
  total_chunks INT NOT NULL,
  checksum    TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  status      TEXT DEFAULT 'active'
);

CREATE TABLE chunks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id     UUID NOT NULL REFERENCES files(id),
  chunk_index INT NOT NULL,
  chunk_id    TEXT NOT NULL UNIQUE,
  size_bytes  BIGINT NOT NULL,
  checksum    TEXT NOT NULL,
  UNIQUE(file_id, chunk_index)
);

CREATE TABLE chunk_locations (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chunk_id  TEXT NOT NULL REFERENCES chunks(chunk_id),
  node_id   TEXT NOT NULL,
  status    TEXT DEFAULT 'healthy',
  stored_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE nodes (
  id              TEXT PRIMARY KEY,
  address         TEXT NOT NULL,
  available_bytes BIGINT,
  used_bytes      BIGINT,
  status          TEXT DEFAULT 'active',
  last_heartbeat  TIMESTAMPTZ DEFAULT NOW(),
  registered_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chunk_locations_chunk ON chunk_locations(chunk_id);
CREATE INDEX idx_chunks_file ON chunks(file_id);
