// Keep this module free of imports: `@commerce-ai-tool/server/flush` is a standalone entry that
// Next.js instrumentation can load without pulling Express into its module graph.

type FlushFn = () => Promise<void>;

/**
 * Runs `fn` after the response has been sent. Hosts pass `after` from `next/server`; the
 * Express adapter binds one to `res.on("finish")`.
 */
export type FlushDefer = (fn: () => Promise<void>) => void;

const FLUSH_GLOBAL_KEY = "__commerceAiToolLangfuseFlush__" as const;

/** At most one flush-failure warning per process in this window. */
const FLUSH_WARNING_INTERVAL_MS = 60_000;

type FlushGlobal = typeof globalThis & {
  [FLUSH_GLOBAL_KEY]?: FlushFn | null;
};

let lastFlushWarningAt: number | undefined;

/**
 * Host apps (e.g. demo-next instrumentation) register LangfuseSpanProcessor.forceFlush here
 * so serverless handlers can flush before the isolate freezes.
 *
 * Uses globalThis so Next.js instrumentation can register without importing this package
 * (avoids pulling Express into the Edge instrumentation graph).
 */
export function registerLangfuseFlush(fn: FlushFn | null): void {
  (globalThis as FlushGlobal)[FLUSH_GLOBAL_KEY] = fn;
}

/**
 * Flushes the registered Langfuse span processor. Never rejects: tracing must not fail a
 * request. A failure logs one warning per minute with the error name only (the message can
 * carry endpoint or payload details).
 */
export async function flushLangfuse(): Promise<void> {
  const hasKeys = Boolean(process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY);
  const registeredFlush = (globalThis as FlushGlobal)[FLUSH_GLOBAL_KEY];
  if (!hasKeys || !registeredFlush) {
    return;
  }

  try {
    await registeredFlush();
  } catch (error) {
    warnFlushFailed(error);
  }
}

/**
 * Starts a flush without making the caller wait for it. Call it after the request span has
 * ended, so the root span is part of the exported batch. With `defer` (Next `after`, Express
 * `res.on("finish")`) the flush runs once the response is sent; without it, or if `defer`
 * throws (for example `after` outside a request scope), it runs detached.
 */
export function scheduleFlush(defer?: FlushDefer): void {
  if (defer) {
    try {
      defer(() => flushLangfuse());
      return;
    } catch {
      // Fall through: a broken scheduler must not lose the trace or fail the request.
    }
  }
  void flushLangfuse();
}

function warnFlushFailed(error: unknown): void {
  const now = Date.now();
  if (lastFlushWarningAt !== undefined && now - lastFlushWarningAt < FLUSH_WARNING_INTERVAL_MS) {
    return;
  }
  lastFlushWarningAt = now;
  const name = error instanceof Error ? error.name : "NonError";
  console.warn(`[commerce-ai-tool/server] Langfuse flush failed: ${name}`);
}

/** @internal Test helper: clears the warning rate limit. */
export function resetLangfuseFlushWarningForTests(): void {
  lastFlushWarningAt = undefined;
}

/** Shared key for hosts that register flush without importing this module. */
export const LANGFUSE_FLUSH_GLOBAL_KEY = FLUSH_GLOBAL_KEY;
