import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@commerce-ai-tool/react", "@commerce-ai-tool/server", "@commerce-ai-tool/core"],
  serverExternalPackages: ["@langfuse/otel", "@opentelemetry/sdk-node"],
};

export default nextConfig;
