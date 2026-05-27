import crypto from "crypto";
import { Readable } from "stream";

export const CHUNK_SIZE = 64 * 1024 * 1024; // 64 MB

// ─────────────────────────────────────────────────────────────────────────────
// Shared Types
// ─────────────────────────────────────────────────────────────────────────────

export interface Chunk {
  index: number;
  chunkId: string;
  buffer: Buffer;
  checksum: string;
  size: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// NEW: Streaming API  (O(chunk_size) peak RAM — only 1 chunk in memory at once)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Async generator that reads a Node.js Readable stream and yields Chunk
 * objects one at a time, each exactly CHUNK_SIZE bytes (last may be smaller).
 *
 * Peak memory: one 64 MB buffer, regardless of total file size.
 *
 * @param readable   Any Node.js Readable (req.body, fs.createReadStream, …)
 * @param chunkSize  Slice size in bytes (default: 64 MB)
 *
 * @yields  Chunk — { index, chunkId, buffer, checksum, size }
 */
export async function* streamToChunks(
  readable: Readable,
  chunkSize: number = CHUNK_SIZE
): AsyncGenerator<Chunk> {
  let index = 0;
  let accumulated: Buffer[] = [];
  let accumulatedSize = 0;

  for await (const rawChunk of readable) {
    const incoming: Buffer = Buffer.isBuffer(rawChunk)
      ? rawChunk
      : Buffer.from(rawChunk);

    let offset = 0;

    // A single network chunk from the stream might span multiple logical
    // 64 MB windows — consume it in a loop until it's fully drained.
    while (offset < incoming.length) {
      const remaining = chunkSize - accumulatedSize;
      const slice = incoming.slice(offset, offset + remaining);
      offset += slice.length;
      accumulated.push(slice);
      accumulatedSize += slice.length;

      // Once the window is full, yield the chunk and reset the accumulator
      if (accumulatedSize >= chunkSize) {
        yield buildChunk(index++, accumulated);
        accumulated = [];
        accumulatedSize = 0;
      }
    }
  }

  // Flush the final (possibly smaller) chunk
  if (accumulatedSize > 0) {
    yield buildChunk(index, accumulated);
  }
}

/**
 * Computes a SHA-256 checksum over an entire Readable stream without loading
 * the file into memory. Returns the hex digest.
 *
 * NOTE: After calling this function the stream is exhausted — you cannot read
 * it again. Pipe to a PassThrough if you need to read it twice.
 */
export async function hashStream(readable: Readable): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    readable.on("data", (chunk) => hash.update(chunk));
    readable.on("end", () => resolve(hash.digest("hex")));
    readable.on("error", reject);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildChunk(index: number, parts: Buffer[]): Chunk {
  const buffer = Buffer.concat(parts);
  const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
  const chunkId = `${checksum}-${index}`;
  return { index, chunkId, buffer, checksum, size: buffer.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// LEGACY: Buffer-based API  (kept for backward compatibility with CLI client)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @deprecated Use streamToChunks() instead — this loads the entire file into RAM.
 */
export function splitBuffer(fileBuffer: Buffer): { chunks: Chunk[]; totalSize: number } {
  const totalSize = fileBuffer.length;
  const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);
  const chunks: Chunk[] = [];

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, totalSize);
    const buffer = fileBuffer.slice(start, end);
    chunks.push(buildChunk(i, [buffer]));
  }

  return { chunks, totalSize };
}

/**
 * @deprecated Use hashStream() instead — this loads the entire file into RAM.
 */
export function getBufferHash(fileBuffer: Buffer): string {
  return crypto.createHash("sha256").update(fileBuffer).digest("hex");
}
