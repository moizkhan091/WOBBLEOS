import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Standalone output → a self-contained server bundle for the isolated Docker/VPS deploy (small runtime image).
  output: "standalone",
};

export default nextConfig;
