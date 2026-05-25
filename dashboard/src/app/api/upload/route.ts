import { NextRequest, NextResponse } from "next/server";
import { splitBuffer, getBufferHash, Chunk } from "@/lib/chunker";
import axios from "axios";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import path from "path";

// Internal Docker network URL for the Coordinator
const COORDINATOR = process.env.COORDINATOR_URL || "http://localhost:8080";
const PROTO_PATH = path.join(process.cwd(), "src/proto/chunk.proto");

function getChunkClient(address: string) {
  const packageDef = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  const proto = grpc.loadPackageDefinition(packageDef) as any;
  return new proto.dcs.ChunkService(address, grpc.credentials.createInsecure());
}

function uploadChunkToNode(client: any, chunk: Chunk, chunkId: string): Promise<any> {
  return new Promise((resolve, reject) => {
    client.UploadChunk(
      {
        chunk_id: chunkId,
        data: chunk.buffer,
        checksum: chunk.checksum,
      },
      (err: any, response: any) => {
        if (err) reject(err);
        else resolve(response);
      }
    );
  });
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    console.log(`[Upload] Processing ${file.name} | Size: ${buffer.length}`);

    const { chunks, totalSize } = splitBuffer(buffer);
    const checksum = getBufferHash(buffer);

    // 1. Register with coordinator
    const planRes = await axios.post(`${COORDINATOR}/api/v1/files/register`, {
      name: file.name,
      size_bytes: totalSize,
      total_chunks: chunks.length,
      checksum: checksum,
    });

    const fileId = planRes.data.file_id;
    const uploadPlan = planRes.data.upload_plan;

    console.log(`[Upload] Plan received for ${fileId}`);

    // 2. Upload chunks to nodes in parallel
    for (const chunk of chunks) {
      const assignment = uploadPlan[chunk.index];
      const assignedNodes = assignment.nodes as string[];
      const chunkId = assignment.chunk_id;

      await Promise.all(
        assignedNodes.map(async (nodeAddr) => {
          const client = getChunkClient(nodeAddr);
          await uploadChunkToNode(client, chunk, chunkId);
          console.log(`[Upload] Chunk ${chunk.index} -> ${nodeAddr} OK`);

          // 3. Confirm to coordinator
          await axios.post(
            `${COORDINATOR}/api/v1/files/${fileId}/chunks/${chunkId}/confirm`,
            { node_id: nodeAddr.split(":")[0], checksum: chunk.checksum }
          );
        })
      );
    }

    console.log(`[Upload] Successfully uploaded ${file.name}`);

    return NextResponse.json({ success: true, file_id: fileId });
  } catch (error: any) {
    console.error("[Upload Error]", error);
    return NextResponse.json(
      { error: error.message || "Failed to upload" },
      { status: 500 }
    );
  }
}
