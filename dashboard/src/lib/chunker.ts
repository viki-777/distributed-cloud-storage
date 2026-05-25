import crypto from "crypto";

export const CHUNK_SIZE = 64 * 1024 * 1024; // 64MB

export interface Chunk {
  index: number;
  chunkId: string;
  buffer: Buffer;
  checksum: string;
  size: number;
}

export function splitBuffer(fileBuffer: Buffer): { chunks: Chunk[]; totalSize: number } {
  const totalSize = fileBuffer.length;
  const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);
  const chunks: Chunk[] = [];

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, totalSize);
    const buffer = fileBuffer.slice(start, end);
    const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
    const chunkId = `${checksum}-${i}`;
    chunks.push({ index: i, chunkId, buffer, checksum, size: end - start });
  }

  return { chunks, totalSize };
}

export function getBufferHash(fileBuffer: Buffer): string {
  return crypto.createHash("sha256").update(fileBuffer).digest("hex");
}
