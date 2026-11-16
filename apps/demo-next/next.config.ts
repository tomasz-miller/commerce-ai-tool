import type { NextConfig } from "next";

// Minimal, app-safe policy: no script-src/style-src/img-src so Next's inline
// scripts and the commercetools CDN images keep working.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  },
  // Voice and camera search need microphone/camera on the demo's own origin.
  { key: "Permissions-Policy", value: "microphone=(self), camera=(self)" },
];

const nextConfig: NextConfig = {
  transpilePackages: ["@commerce-ai-tool/react", "@commerce-ai-tool/server", "@commerce-ai-tool/core"],
  serverExternalPackages: ["@langfuse/otel", "@opentelemetry/sdk-node"],
  experimental: {
    // 16.3 defaults to the tsc CLI, which expects typescript/bin/tsc.
    // demo-next aliases `typescript` to @typescript/typescript6 (JS API, tsc6 only).
    useTypeScriptCli: false,
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
