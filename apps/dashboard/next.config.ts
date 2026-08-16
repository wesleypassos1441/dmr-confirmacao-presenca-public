import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));

const nextConfig: NextConfig = {
  output: "export",
  poweredByHeader: false,
  allowedDevOrigins: ["127.0.0.1"],
  turbopack: {
    root: workspaceRoot,
  },
};

export default nextConfig;
