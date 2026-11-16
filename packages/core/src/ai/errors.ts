import type { AITask } from "./defaults.js";

/**
 * The AI provider rejected the call with 429 after the SDK retries ran out. Hosts map it to
 * 429 RATE_LIMITED. The message is fixed: the provider body is never copied into it.
 */
export class AIRateLimitedError extends Error {
  readonly status = 429;

  constructor(options?: { cause?: unknown }) {
    super("AI provider rate limit reached", options);
    this.name = "AIRateLimitedError";
  }
}

/**
 * The AI provider is unavailable: out of credits (402), a 5xx after retries, or the connection
 * failed. Hosts map it to 503 UPSTREAM_UNAVAILABLE. `status` is undefined for connection errors.
 */
export class AIUpstreamError extends Error {
  readonly status: number | undefined;

  constructor(status?: number, options?: { cause?: unknown }) {
    super(
      status === undefined
        ? "AI provider connection failed"
        : `AI provider unavailable (HTTP ${status})`,
      options,
    );
    this.name = "AIUpstreamError";
    this.status = status;
  }
}

/**
 * The model hit the output-token cap (`finishReason: "length"`). The partial output is discarded
 * rather than repaired. Hosts map it to 503 UPSTREAM_UNAVAILABLE.
 */
export class AIOutputTruncatedError extends Error {
  readonly task: AITask;
  readonly model: string;

  constructor(task: AITask, model: string) {
    super(`AI output truncated by the token cap (task: ${task}, model: ${model})`);
    this.name = "AIOutputTruncatedError";
    this.task = task;
    this.model = model;
  }
}
