import {
  isLangfuseEnabled,
  redactBinaryInput,
  shouldTraceSuggestions,
  withPipelineSpan,
} from "@commerce-ai-tool/core";
import { flushLangfuse } from "./flush.js";

export { flushLangfuse, registerLangfuseFlush } from "./flush.js";

export async function withRequestSpan<T>(
  name: string,
  attributes: { input?: unknown; metadata?: Record<string, unknown> },
  fn: () => Promise<T>,
): Promise<T> {
  return withPipelineSpan(name, attributes, async (span) => {
    try {
      const result = await fn();
      span?.update({ output: summarizeResult(result) });
      return result;
    } finally {
      await flushLangfuse();
    }
  });
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
): Promise<T> {
  if (!enabled) {
    return fn();
  }
  return withRequestSpan(name, attributes, fn);
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
