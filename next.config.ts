import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lean, self-contained build for the Docker image (deploy/Dockerfile) —
  // bundles only the traced dependencies instead of shipping all of
  // node_modules.
  output: "standalone",
};

export default nextConfig;
