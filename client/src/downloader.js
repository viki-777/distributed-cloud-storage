const axios = require('axios');
const path = require('path');
const fs = require('fs').promises;
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

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
    return new proto.ChunkService(address, grpc.credentials.createInsecure(), {
        'grpc.max_receive_message_length': 100 * 1024 * 1024,
        'grpc.max_send_message_length': 100 * 1024 * 1024
    });
}

function downloadChunkFromNode(client, chunkId) {
    return new Promise((resolve, reject) => {
        client.DownloadChunk({ chunk_id: chunkId }, (err, response) => {
            if (err) reject(err);
            else resolve(response);
        });
    });
}

async function download(fileId, outputPath) {
    console.log(`Fetching download plan for file: ${fileId}`);

    // 1. Get file info and download plan from coordinator
    const resp = await axios.get(`${COORDINATOR}/api/v1/files/${fileId}`);
    const file = resp.data.file;
    const downloadPlan = resp.data.download_plan;

    if (!downloadPlan || downloadPlan.length === 0) {
        console.error('No chunks found for this file');
        return;
    }

    const finalPath = outputPath || file.name;
    console.log(`File: ${file.name} | Chunks: ${downloadPlan.length}`);

    // 2. Download chunks in order
    const buffers = [];
    for (const entry of downloadPlan) {
        console.log(`  Downloading chunk ${entry.chunk_index} from ${entry.nodes[0]}...`);
        const client = getChunkClient(entry.nodes[0]);
        const response = await downloadChunkFromNode(client, entry.chunk_id);
        buffers[entry.chunk_index] = Buffer.from(response.data);
        console.log(`     Chunk ${entry.chunk_index} received (${response.data.length} bytes)`);
    }

    // 3. Reassemble file
    const finalBuffer = Buffer.concat(buffers);
    await fs.writeFile(finalPath, finalBuffer);
    console.log(`\nDownloaded and reassembled: ${finalPath} (${finalBuffer.length} bytes)`);
}

module.exports = { download };
