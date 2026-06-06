import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The /api routes read these JSON files from disk at runtime (lib/data.ts). Serverless hosts
  // (Vercel/Netlify) don't include public/ in the function bundle by default, so trace them in —
  // otherwise the game deploys but loads zero players. Globs resolve from the project root (web/).
  outputFileTracingIncludes: {
    "/api/**": ["./public/data/**"],
  },
};

export default nextConfig;
