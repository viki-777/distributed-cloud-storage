import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import path from "path";

const COORDINATOR = process.env.COORDINATOR_URL || "http://localhost:8080";
const PROTO_PATH = path.join(process.cwd(), "src/proto/chunk.proto");

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
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  const proto = grpc.loadPackageDefinition(packageDef) as any;
  return new proto.dcs.ChunkService(mappedAddress, grpc.credentials.createInsecure(), {
    "grpc.max_receive_message_length": 100 * 1024 * 1024,
    "grpc.max_send_message_length": 100 * 1024 * 1024,
  });
}

function downloadChunkFromNode(client: any, chunkId: string): Promise<any> {
  return new Promise((resolve, reject) => {
    client.DownloadChunk({ chunk_id: chunkId }, (err: any, response: any) => {
      if (err) reject(err);
      else resolve(response);
    });
  });
}

export async function GET(req: NextRequest) {
  try {
    const fileId = req.nextUrl.searchParams.get("fileId");
    if (!fileId) {
      return new NextResponse("Missing fileId", { status: 400 });
    }

    console.log(`[Download] Fetching plan for ${fileId}`);
    const resp = await axios.get(`${COORDINATOR}/api/v1/files/${fileId}`);
    const file = resp.data.file;
    const downloadPlan = resp.data.download_plan;

    if (!downloadPlan || downloadPlan.length === 0) {
      return new NextResponse("No chunks found for file", { status: 404 });
    }

    const buffers: Buffer[] = [];

    // Download chunks sequentially (or in parallel) and reassemble
    // Parallel is faster, but sequential is easier for tracking. Let's do parallel mapped by index.
    await Promise.all(
      downloadPlan.map(async (entry: any) => {
        const nodeAddr = entry.nodes[0]; // pick first available node
        console.log(`[Download] Chunk ${entry.chunk_index} from ${nodeAddr}`);
        const client = getChunkClient(nodeAddr);
        const response = await downloadChunkFromNode(client, entry.chunk_id);
        buffers[entry.chunk_index] = Buffer.from(response.data);
      })
    );

    const finalBuffer = Buffer.concat(buffers);
    console.log(`[Download] File reassembled. Size: ${finalBuffer.length} bytes`);

    // Stream the file back to the browser
    const response = new NextResponse(finalBuffer);
    response.headers.set("Content-Disposition", `attachment; filename="${file.name}"`);
    response.headers.set("Content-Type", "application/octet-stream");
    response.headers.set("Content-Length", finalBuffer.length.toString());

    return response;
  } catch (error: any) {
    console.error("[Download Error]", error);
    return new NextResponse(error.message || "Failed to download", {
      status: 500,
    });
  }
}
