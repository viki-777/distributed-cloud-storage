const fs = require('fs').promises;
const crypto = require('crypto');

const CHUNK_SIZE = 64 * 1024 * 1024; // 64MB

async function splitFile(filePath) {
    const stat = await fs.stat(filePath);
    const totalChunks = Math.ceil(stat.size / CHUNK_SIZE);
    const chunks = [];

    const fileBuffer = await fs.readFile(filePath);

    for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, stat.size);
        const buffer = fileBuffer.slice(start, end);
        const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
        const chunkId = `${checksum}-${i}`;
        chunks.push({ index: i, chunkId, buffer, checksum, size: end - start });
    }
    return { chunks, totalSize: stat.size };
}

async function fileHash(filePath) {
    const buffer = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

module.exports = { splitFile, fileHash, CHUNK_SIZE };
