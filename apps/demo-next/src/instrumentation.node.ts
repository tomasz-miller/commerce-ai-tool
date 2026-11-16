import { LangfuseSpanProcessor } from "@langfuse/otel";
import { defaultLangfuseMask, registerLangfuseFlush } from "@commerce-ai-tool/server/flush";
import { NodeSDK } from "@opentelemetry/sdk-node";

// `@commerce-ai-tool/server/flush` is a standalone entry with no Express import, and this file
// is only loaded for the Node.js runtime (see instrumentation.ts), so it is safe to import here.

if (process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY) {
  const langfuseSpanProcessor = new LangfuseSpanProcessor({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    baseUrl: process.env.LANGFUSE_BASE_URL,
    // Redacts e-mail addresses and phone numbers from exported inputs, outputs and metadata.
    mask: defaultLangfuseMask,
  });

  const sdk = new NodeSDK({
    spanProcessors: [langfuseSpanProcessor],
  });

  sdk.start();
  // Called after the response by createNextHandlers({ defer: after }); never awaited inline.
  registerLangfuseFlush(() => langfuseSpanProcessor.forceFlush());
}
