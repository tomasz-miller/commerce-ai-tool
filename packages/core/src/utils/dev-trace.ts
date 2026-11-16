import { hashUint8Array } from "./hash.js";

/** Verbose tracing is opt-in: `NODE_ENV` never turns it on. */
function isDevTracingEnabled(): boolean {
  return process.env.CAT_DEBUG === "true";
}

function isRawTraceEnabled(): boolean {
  return process.env.CAT_DEBUG_RAW === "true";
}

/** Keys that hold free text typed or spoken by the shopper. */
const SHOPPER_TEXT_KEYS = ["query", "refineQuery", "prefix", "transcript"] as const;

/** Replaces shopper text with its length and a short hash, so log lines can be correlated without the text. */
function withoutShopperText(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...data };
  for (const key of SHOPPER_TEXT_KEYS) {
    const value = result[key];
    if (typeof value !== "string") {
      continue;
    }
    delete result[key];
    result[`${key}Length`] = value.length;
    result[`${key}Hash`] = hashUint8Array(new TextEncoder().encode(value)).slice(0, 12);
  }
  return result;
}

/**
 * Logs a search pipeline step with `CAT_DEBUG=true`. Shopper text (`query`, `refineQuery`,
 * `prefix`, `transcript`) is logged as length and hash unless `CAT_DEBUG_RAW=true` is also set.
 */
export function logSearchTrace(step: string, data: Record<string, unknown>): void {
  if (!isDevTracingEnabled()) {
    return;
  }

  console.info(
    `[commerce-ai-tool/core] search.trace ${step}:`,
    JSON.stringify(isRawTraceEnabled() ? data : withoutShopperText(data), null, 2),
  );
}
