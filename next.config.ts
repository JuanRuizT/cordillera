import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "canvas", "dommatrix"],
  outputFileTracingIncludes: {
    "/api/**/*": [
      "./node_modules/pdfjs-dist/**/*",
      "./node_modules/pdf-parse/**/*",
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
