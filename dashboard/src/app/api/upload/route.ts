import { NextRequest } from "next/server";
import { streamToChunks, CHUNK_SIZE } from "@/lib/chunker";
import axios from "axios";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import path from "path";
import { Readable } from "stream";
import Busboy from "busboy";
import { Chunk } from "@/lib/chunker";

// ── Config ────────────────────────────────────────────────────────────────────

export const runtime = "nodejs"; // Need Node.js for streams + busboy

const COORDINATOR = process.env.COORDINATOR_URL || "http://localhost:8080";
const PROTO_PATH = path.join(process.cwd(), "src/proto/chunk.proto");

// ── SSE Helpers ───────────────────────────────────────────────────────────────

/** Format a JSON payload as a Server-Sent Event data line. */
function sseEvent(payload: object): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

// ── gRPC helpers ──────────────────────────────────────────────────────────────

function mapLocalAddress(address: string): string {
  if (address.startsWith("node-001")) return address.replace("node-001:50051", "localhost:50051");
  if (address.startsWith("node-002")) return address.replace("node-002:50051", "localhost:50052");
  if (address.startsWith("node-003")) return address.replace("node-003:50051", "localhost:50053");
  return address;
}

function getChunkClient(address: string) {
  const mappedAddress = mapLocalAddress(address);
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

// ── Streaming Upload Handler (SSE response) ───────────────────────────────────

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";

  // Convert Web ReadableStream → Node.js Readable for busboy
  const nodeReadable = Readable.fromWeb(req.body as any);
  const bb = Busboy({ headers: { "content-type": contentType } });

  // Create a TransformStream so we can push SSE events from inside an async
  // callback and have them stream out to the browser in real time.
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  const response = new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Disable Nginx buffering if behind a proxy
    },
  });

  // Run the upload pipeline asynchronously so the Response is returned
  // immediately and the SSE stream opens while the upload is in progress.
  (async () => {
    try {
      await new Promise<void>((resolve, reject) => {
        let fileName = "";
        let fileSize = 0;
        let isEncrypted = false;

        bb.on("field", (fieldName, value) => {
          if (fieldName === "file_name")    fileName    = value;
          if (fieldName === "file_size")    fileSize    = parseInt(value, 10);
          if (fieldName === "is_encrypted") isEncrypted = value === "true";
        });

        bb.on("file", async (_fieldName, fileStream, info) => {
          try {
            if (!fileName) fileName = info.filename;
            const totalChunks = Math.max(1, Math.ceil(fileSize / CHUNK_SIZE));

            console.log(`[Stream] ${fileName} | ${fileSize}B | ${totalChunks} chunks | e2ee=${isEncrypted}`);

            // Emit initial status
            await writer.write(sseEvent({ status: "registering", totalChunks }));

            // Register with coordinator
            const planRes = await axios.post(`${COORDINATOR}/api/v1/files/register`, {
              name: fileName,
              size_bytes: fileSize,
              total_chunks: totalChunks,
              checksum: "streaming",
              is_encrypted: isEncrypted,
            });

            const fileId: string = planRes.data.file_id;
            const uploadPlan: any = planRes.data.upload_plan;

            await writer.write(sseEvent({ status: "uploading", fileId, totalChunks, progress: 0 }));

            // Stream chunks one at a time → gRPC
            let chunksUploaded = 0;
            for await (const chunk of streamToChunks(fileStream)) {
              const assignment = uploadPlan[chunk.index];
              if (!assignment) throw new Error(`No assignment for chunk ${chunk.index}`);

              const assignedNodes = assignment.nodes as string[];
              const chunkId = assignment.chunk_id;

              await Promise.all(
                assignedNodes.map(async (nodeAddr) => {
                  const client = getChunkClient(nodeAddr);
                  await uploadChunkToNode(client, chunk, chunkId);
                  await axios.post(
                    `${COORDINATOR}/api/v1/files/${fileId}/chunks/${chunkId}/confirm`,
                    { node_id: nodeAddr.split(":")[0], checksum: chunk.checksum }
                  );
                })
              );

              chunksUploaded++;
              const progress = Math.round((chunksUploaded / totalChunks) * 100);

              // Emit progress event after every chunk
              await writer.write(sseEvent({
                status: "uploading",
                chunk: chunksUploaded,
                totalChunks,
                progress,
              }));

              console.log(`[Stream] Chunk ${chunksUploaded}/${totalChunks} (${progress}%)`);
            }

            // Emit done event
            await writer.write(sseEvent({ status: "done", fileId, progress: 100 }));
            console.log(`[Stream] ✓ Upload complete: ${fileName}`);
            resolve();
          } catch (err: any) {
            console.error("[Stream] Error:", err);
            await writer.write(sseEvent({ status: "error", error: err.message ?? "Upload failed" }));
            reject(err);
          }
        });

        bb.on("error", async (err: Error) => {
          await writer.write(sseEvent({ status: "error", error: err.message }));
          reject(err);
        });

        nodeReadable.pipe(bb);
      });
    } catch {
      // Error already written to SSE stream above
    } finally {
      await writer.close();
    }
  })();

  return response;
}
