import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: 'http://localhost:8080/api/v1/:path*',
      },
    ];
  },

  // ── Streaming Upload: remove Next.js body size limits ──────────────────────
  //
  // By default Next.js caps API route request bodies at 4 MB. Since our
  // upload route uses busboy to stream the body directly (never buffers it),
  // we disable this cap so files of any size can be uploaded.
  //
  // Note: The upload route itself sets `export const runtime = "nodejs"` and
  // consumes req.body as a stream, so no server RAM spike occurs.
  experimental: {
    serverActions: {
      bodySizeLimit: "10gb",
    },
  },
};

export default nextConfig;
