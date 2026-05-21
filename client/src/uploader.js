const axios = require('axios');
const path = require('path');
const fs = require('fs').promises;
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const { splitFile, fileHash } = require('./chunker');

const COORDINATOR = process.env.COORDINATOR_URL || 'http://localhost:8080';
const PROTO_PATH = path.join(__dirname, '../../proto/chunk.proto');

function getChunkClient(address) {
    const packageDef = protoLoader.loadSync(PROTO_PATH, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
    });
    const proto = grpc.loadPackageDefinition(packageDef).dcs;
    return new proto.ChunkService(address, grpc.credentials.createInsecure());
}

function uploadChunkToNode(client, chunk) {
    return new Promise((resolve, reject) => {
        client.UploadChunk({
            chunk_id: chunk.chunkId,
            data: chunk.buffer,
            checksum: chunk.checksum,
        }, (err, response) => {
            if (err) reject(err);
            else resolve(response);
        });
    });
}

async function upload(filePath) {
    console.log(`Splitting file: ${filePath}`);
    const { chunks, totalSize } = await splitFile(filePath);
    const checksum = await fileHash(filePath);

    console.log(`File: ${path.basename(filePath)} | Size: ${totalSize} bytes | Chunks: ${chunks.length}`);

    // 1. Register file with coordinator
    const plan = await axios.post(`${COORDINATOR}/api/v1/files/register`, {
        name: path.basename(filePath),
        size_bytes: totalSize,
        total_chunks: chunks.length,
        checksum: checksum,
    });

    const fileId = plan.data.file_id;
    const uploadPlan = plan.data.upload_plan;
    console.log(`Upload plan received. File ID: ${fileId}`);

    // 2. Upload each chunk to assigned nodes
    for (const chunk of chunks) {
        const assignment = uploadPlan[chunk.index];
        console.log(`  Uploading chunk ${chunk.index} to ${assignment.nodes.length} nodes...`);

        for (const nodeAddr of assignment.nodes) {
            const client = getChunkClient(nodeAddr);
            await uploadChunkToNode(client, chunk);
            console.log(`     Chunk ${chunk.index} -> ${nodeAddr} OK`);

            // 3. Confirm to coordinator
            await axios.post(
                `${COORDINATOR}/api/v1/files/${fileId}/chunks/${assignment.chunk_id}/confirm`,
                { node_id: nodeAddr, checksum: chunk.checksum }
            );
        }
    }

    console.log(`\nUpload complete! File ID: ${fileId}`);
    return fileId;
}

module.exports = { upload };
