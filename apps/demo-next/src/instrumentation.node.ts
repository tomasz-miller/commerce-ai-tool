import { LangfuseSpanProcessor } from "@langfuse/otel";
import { NodeSDK } from "@opentelemetry/sdk-node";

/** Must match packages/server/src/observability/flush.ts */
const LANGFUSE_FLUSH_GLOBAL_KEY = "__commerceAiToolLangfuseFlush__";

type FlushGlobal = typeof globalThis & {
  [LANGFUSE_FLUSH_GLOBAL_KEY]?: (() => Promise<void>) | null;
};

if (process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY) {
  const langfuseSpanProcessor = new LangfuseSpanProcessor({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    baseUrl: process.env.LANGFUSE_BASE_URL,
  });

  const sdk = new NodeSDK({
    spanProcessors: [langfuseSpanProcessor],
  });

  sdk.start();
  (globalThis as FlushGlobal)[LANGFUSE_FLUSH_GLOBAL_KEY] = () => langfuseSpanProcessor.forceFlush();
}
