import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@commerce-ai-tool/react", "@commerce-ai-tool/server", "@commerce-ai-tool/core"],
};

export default nextConfig;
