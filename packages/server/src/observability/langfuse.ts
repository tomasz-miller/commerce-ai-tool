import {
  isLangfuseEnabled,
  redactBinaryInput,
  shouldTraceSuggestions,
  withPipelineSpan,
} from "@commerce-ai-tool/core/internal";
import { scheduleFlush, type FlushDefer } from "./flush.js";

export { flushLangfuse, registerLangfuseFlush, scheduleFlush } from "./flush.js";
export type { FlushDefer } from "./flush.js";

/**
 * Run `fn` inside the request span, then schedule the Langfuse flush. The flush is scheduled
 * after the span has ended (so the root span is exported with its children) and is never
 * awaited: the response does not wait for the export, and a failing export cannot fail it.
 * Pass `defer` to run the flush after the response is sent (Next `after`, Express `finish`).
 */
export async function withRequestSpan<T>(
  name: string,
  attributes: { input?: unknown; metadata?: Record<string, unknown> },
  fn: () => Promise<T>,
  defer?: FlushDefer,
): Promise<T> {
  try {
    return await withPipelineSpan(name, attributes, async (span) => {
      const result = await fn();
      span?.update({ output: summarizeResult(result) });
      return result;
    });
  } finally {
    scheduleFlush(defer);
  }
}

/**
 * Run a handler without creating a Langfuse span (still no flush).
 * Used for high-volume autocomplete unless LANGFUSE_TRACE_SUGGESTIONS=true.
 */
export async function withOptionalRequestSpan<T>(
  enabled: boolean,
  name: string,
  attributes: { input?: unknown; metadata?: Record<string, unknown> },
  fn: () => Promise<T>,
  defer?: FlushDefer,
): Promise<T> {
  if (!enabled) {
    return fn();
  }
  return withRequestSpan(name, attributes, fn, defer);
}

export { shouldTraceSuggestions };

function summarizeResult(result: unknown): unknown {
  if (!result || typeof result !== "object") {
    return undefined;
  }

  const record = result as {
    meta?: {
      total?: number;
      traceId?: string;
      searchTerms?: string[];
      queryInterpretation?: string;
    };
    products?: unknown[];
    transcript?: string;
    interpretation?: string;
  };

  if ("products" in record || "meta" in record) {
    return {
      total: record.meta?.total,
      productCount: Array.isArray(record.products) ? record.products.length : undefined,
      traceId: record.meta?.traceId,
      hasTranscript: Boolean(record.transcript),
      transcript: typeof record.transcript === "string" ? record.transcript : undefined,
      searchTerms: record.meta?.searchTerms,
      interpretation: record.meta?.queryInterpretation ?? record.interpretation,
    };
  }

  if (Buffer.isBuffer(result)) {
    return { byteLength: result.byteLength };
  }

  return undefined;
}

export { redactBinaryInput, isLangfuseEnabled };
