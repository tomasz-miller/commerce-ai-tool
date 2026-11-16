import { LangfuseSpanProcessor } from "@langfuse/otel";
import { defaultLangfuseMask, registerLangfuseFlush } from "@commerce-ai-tool/server/flush";
import { NodeSDK } from "@opentelemetry/sdk-node";

/**
 * Registers the OpenTelemetry exporter that sends the BFF's Langfuse spans. Without it the
 * Langfuse tracing helpers in `@commerce-ai-tool/server` create spans that nothing exports.
 * Mirrors `apps/demo-next/src/instrumentation.node.ts`. Call it after the env files are loaded.
 *
 * Starts only when both `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` are set and returns
 * the SDK, or undefined when tracing stays off.
 */
export function startLangfuseTracing(
  env: NodeJS.ProcessEnv = process.env,
): Pick<NodeSDK, "shutdown"> | undefined {
  if (!env.LANGFUSE_PUBLIC_KEY || !env.LANGFUSE_SECRET_KEY) {
    return undefined;
  }

  const langfuseSpanProcessor = new LangfuseSpanProcessor({
    publicKey: env.LANGFUSE_PUBLIC_KEY,
    secretKey: env.LANGFUSE_SECRET_KEY,
    baseUrl: env.LANGFUSE_BASE_URL,
    // Redacts e-mail addresses and phone numbers from exported inputs, outputs and metadata.
    mask: defaultLangfuseMask,
  });

  const sdk = new NodeSDK({ spanProcessors: [langfuseSpanProcessor] });
  sdk.start();
  // The Express adapter runs this after each response (`res.on("finish")`); never awaited inline.
  registerLangfuseFlush(() => langfuseSpanProcessor.forceFlush());
  return sdk;
}

/**
 * On SIGTERM and SIGINT: stops accepting connections (`server.close()`), then flushes and stops
 * the exporter, then exits. Once only: a second signal while the shutdown runs does not start
 * another. A failing close or shutdown still ends in exit.
 */
export function shutdownOnSignals(
  sdk: Pick<NodeSDK, "shutdown">,
  proc: Pick<NodeJS.Process, "once"> = process,
  exit: (code: number) => void = process.exit,
  server?: { close(callback?: (error?: Error) => void): unknown },
): void {
  let shuttingDown = false;
  const closeServer = (): Promise<void> =>
    new Promise((resolve) => {
      if (!server) {
        resolve();
        return;
      }
      // An error means the server was not listening; there is nothing to wait for.
      server.close(() => resolve());
    });
  const shutdown = (): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    void closeServer()
      .then(() => sdk.shutdown())
      .catch(() => {
        // Exporting is best effort; the process is stopping anyway.
      })
      .finally(() => exit(0));
  };
  proc.once("SIGTERM", shutdown);
  proc.once("SIGINT", shutdown);
}
