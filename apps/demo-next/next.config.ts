import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@commerce-ai-tool/react", "@commerce-ai-tool/server", "@commerce-ai-tool/core"],
  serverExternalPackages: ["@langfuse/otel", "@opentelemetry/sdk-node"],
  experimental: {
    // 16.3 defaults to the tsc CLI, which expects typescript/bin/tsc.
    // demo-next aliases `typescript` to @typescript/typescript6 (JS API, tsc6 only).
    useTypeScriptCli: false,
  },
};

export default nextConfig;
