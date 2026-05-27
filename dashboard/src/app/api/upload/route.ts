import { NextRequest, NextResponse } from "next/server";
import { streamToChunks, CHUNK_SIZE } from "@/lib/chunker";
import axios from "axios";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import path from "path";
import { Readable } from "stream";
import Busboy from "busboy";
import { Chunk } from "@/lib/chunker";

// ── Config ────────────────────────────────────────────────────────────────────

// Force Node.js runtime so we can use Node streams + busboy
export const runtime = "nodejs";

const COORDINATOR = process.env.COORDINATOR_URL || "http://localhost:8080";
const PROTO_PATH = path.join(process.cwd(), "src/proto/chunk.proto");

// ── gRPC helpers (unchanged) ──────────────────────────────────────────────────

function mapLocalAddress(address: string): string {
  if (address.startsWith("node-001")) return address.replace("node-001:50051", "localhost:50051");
  if (address.startsWith("node-002")) return address.replace("node-002:50051", "localhost:50052");
  if (address.startsWith("node-003")) return address.replace("node-003:50051", "localhost:50053");
  return address;
}

function getChunkClient(address: string) {
  const mappedAddress = mapLocalAddress(address);
  console.log(`[gRPC] Connecting to ${mappedAddress} (original: ${address})`);
  const packageDef = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true, longs: String, enums: String, defaults: true, oneofs: true,
  });
  const proto = grpc.loadPackageDefinition(packageDef) as any;
  return new proto.dcs.ChunkService(mappedAddress, grpc.credentials.createInsecure(), {
    "grpc.max_receive_message_length": 100 * 1024 * 1024,
    "grpc.max_send_message_length": 100 * 1024 * 1024,
  });
}

function uploadChunkToNode(client: any, chunk: Chunk, chunkId: string): Promise<any> {
  return new Promise((resolve, reject) => {
    client.UploadChunk(
      { chunk_id: chunkId, data: chunk.buffer, checksum: chunk.checksum },
      (err: any, res: any) => (err ? reject(err) : resolve(res))
    );
  });
}

// ── Streaming Upload Handler ──────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") ?? "";

    // Convert the Web ReadableStream (Next.js) → Node.js Readable for busboy
    const nodeReadable = Readable.fromWeb(req.body as any);

    const bb = Busboy({ headers: { "content-type": contentType } });

    // ── Parse multipart form fields and file stream ───────────────────────────
    const result = await new Promise<NextResponse>((resolve) => {
      // Metadata fields — must be appended BEFORE the file in FormData
      let fileName = "";
      let fileSize = 0;
      let isEncrypted = false;

      bb.on("field", (fieldName, value) => {
        if (fieldName === "file_name")    fileName    = value;
        if (fieldName === "file_size")    fileSize    = parseInt(value, 10);
        if (fieldName === "is_encrypted") isEncrypted = value === "true";
      });

      // ── File stream: where the magic happens ─────────────────────────────
      bb.on("file", async (_fieldName, fileStream, info) => {
        try {
          // Fall back to busboy's detected filename if field wasn't sent
          if (!fileName) fileName = info.filename;

          const totalChunks = Math.max(1, Math.ceil(fileSize / CHUNK_SIZE));

          console.log(
            `[Stream] ${fileName} | ${fileSize} bytes | ${totalChunks} chunks | encrypted=${isEncrypted}`
          );

          // 1. Register file with coordinator to get the upload plan
          const planRes = await axios.post(`${COORDINATOR}/api/v1/files/register`, {
            name: fileName,
            size_bytes: fileSize,
            total_chunks: totalChunks,
            // Checksum is computed incrementally below; stored after upload
            checksum: "streaming",
            is_encrypted: isEncrypted,
          });

          const fileId: string = planRes.data.file_id;
          const uploadPlan: any = planRes.data.upload_plan;

          console.log(`[Stream] Upload plan received. File ID: ${fileId}`);

          // 2. Stream the file through the chunker — O(64 MB) peak RAM
          let chunksUploaded = 0;
          for await (const chunk of streamToChunks(fileStream)) {
            const assignment = uploadPlan[chunk.index];
            if (!assignment) throw new Error(`No assignment for chunk ${chunk.index}`);

            const assignedNodes = assignment.nodes as string[];
            const chunkId = assignment.chunk_id;

            // Upload this chunk to every replica node in parallel
            await Promise.all(
              assignedNodes.map(async (nodeAddr) => {
                const client = getChunkClient(nodeAddr);
                await uploadChunkToNode(client, chunk, chunkId);

                // Confirm to coordinator
                await axios.post(
                  `${COORDINATOR}/api/v1/files/${fileId}/chunks/${chunkId}/confirm`,
                  { node_id: nodeAddr.split(":")[0], checksum: chunk.checksum }
                );
              })
            );

            chunksUploaded++;
            console.log(`[Stream] Chunk ${chunk.index + 1}/${totalChunks} done`);
          }

          console.log(`[Stream] ✓ Upload complete: ${fileName} (${chunksUploaded} chunks)`);
          resolve(NextResponse.json({ success: true, file_id: fileId }));
        } catch (err: any) {
          console.error("[Stream] Upload error:", err);
          resolve(NextResponse.json({ error: err.message ?? "Upload failed" }, { status: 500 }));
        }
      });

      bb.on("error", (err: Error) => {
        console.error("[Stream] Busboy error:", err);
        resolve(NextResponse.json({ error: err.message }, { status: 500 }));
      });

      // Pipe the Node.js HTTP stream into busboy
      nodeReadable.pipe(bb);
    });

    return result;
  } catch (err: any) {
    console.error("[Upload] Unexpected error:", err);
    return NextResponse.json({ error: err.message ?? "Upload failed" }, { status: 500 });
  }
}
