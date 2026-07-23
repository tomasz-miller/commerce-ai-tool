import {
  getActiveTraceId,
  propagateAttributes,
  startActiveObservation,
  type LangfuseSpan,
} from "@langfuse/tracing";
import { isLangfuseEnabled, shouldExposeTraceId } from "./enabled.js";

export type PipelineSpanAttributes = {
  input?: unknown;
  output?: unknown;
  metadata?: Record<string, unknown>;
};

export type PropagatedTraceMetadata = Record<string, string>;

/**
 * Run `fn` inside a Langfuse span when tracing is enabled; otherwise call through.
 */
export async function withPipelineSpan<T>(
  name: string,
  attributes: PipelineSpanAttributes,
  fn: (span: LangfuseSpan | null) => Promise<T>,
): Promise<T> {
  if (!isLangfuseEnabled()) {
    return fn(null);
  }

  return startActiveObservation(name, async (span) => {
    if (attributes.input !== undefined || attributes.metadata) {
      span.update({
        input: attributes.input,
        metadata: attributes.metadata,
      });
    }

    try {
      const result = await fn(span);
      if (attributes.output !== undefined) {
        span.update({ output: attributes.output });
      }
      return result;
    } catch (error) {
      span.update({
        level: "ERROR",
        statusMessage: error instanceof Error ? error.message : "unknown error",
      });
      throw error;
    }
  });
}

/**
 * Attach request-scoped metadata to the active trace and all child observations.
 */
export async function withPropagatedAttributes<T>(
  metadata: PropagatedTraceMetadata,
  fn: () => Promise<T>,
): Promise<T> {
  if (!isLangfuseEnabled()) {
    return fn();
  }

  return propagateAttributes({ metadata }, fn);
}

export function getCurrentTraceId(): string | undefined {
  if (!shouldExposeTraceId()) {
    return undefined;
  }
  return getActiveTraceId();
}

export function withTraceIdMeta<T extends { meta: object }>(result: T): T {
  const traceId = getCurrentTraceId();
  if (!traceId) {
    return result;
  }
  return {
    ...result,
    meta: {
      ...result.meta,
      traceId,
    },
  };
}
