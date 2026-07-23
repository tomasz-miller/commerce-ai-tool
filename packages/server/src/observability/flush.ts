type FlushFn = () => Promise<void>;

const FLUSH_GLOBAL_KEY = "__commerceAiToolLangfuseFlush__" as const;

type FlushGlobal = typeof globalThis & {
  [FLUSH_GLOBAL_KEY]?: FlushFn | null;
};

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

export async function flushLangfuse(): Promise<void> {
  const hasKeys = Boolean(process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY);
  const registeredFlush = (globalThis as FlushGlobal)[FLUSH_GLOBAL_KEY];
  if (!hasKeys || !registeredFlush) {
    return;
  }
  await registeredFlush();
}

/** Shared key for hosts that register flush without importing this module. */
export const LANGFUSE_FLUSH_GLOBAL_KEY = FLUSH_GLOBAL_KEY;
