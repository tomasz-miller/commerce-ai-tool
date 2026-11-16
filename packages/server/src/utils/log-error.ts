import type { ApiErrorCode } from "@commerce-ai-tool/core";
import { redactPii } from "../observability/mask.js";

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function isDebugEnabled(): boolean {
  return process.env.CAT_DEBUG === "true";
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "NonError";
}

/** Quoted substrings of an error message. In-word apostrophes (`John's`) are not quotes. */
const QUOTED_VALUE_PATTERN = new RegExp(
  [
    '""', // empty: nothing to hide
    '"[^"]+"', // double-quoted
    '"[^\\n]*$', // unterminated double quote: to the end of the line
    "(?<![A-Za-z])'[^']+'(?![A-Za-z])", // single-quoted, not an in-word apostrophe
    "(?<![A-Za-z])'[^\\n]*$", // unterminated single quote: to the end of the line
  ].join("|"),
  "gm",
);

/**
 * The production message can carry customer input: commercetools InvalidField/DuplicateField
 * messages embed the submitted value and provider errors embed the response body. Quoted
 * substrings are replaced, then e-mail addresses and phone-number-like digit runs.
 */
function redactErrorMessage(message: string): string {
  const withoutQuoted = message.replace(QUOTED_VALUE_PATTERN, (match) =>
    match === '""' ? match : '"[redacted]"',
  );
  return redactPii(withoutQuoted);
}

/**
 * Always logs the handler, error class, API error code (when known) and message at error level so
 * unexpected 500s are visible in production. Outside CAT_DEBUG=true the message is redacted
 * (quoted values, e-mails, phone numbers); with CAT_DEBUG=true the full message, request payload,
 * stack and cause are logged.
 */
export function logServerError(
  handler: string,
  error: unknown,
  context?: Record<string, unknown>,
  code?: ApiErrorCode,
): void {
  const prefix = `[commerce-ai-tool/server] ${handler}`;
  const message = isDebugEnabled() ? formatError(error) : redactErrorMessage(formatError(error));

  console.error(`${prefix} failed${code ? ` (${code})` : ""}: ${errorName(error)}: ${message}`);

  if (!isDebugEnabled()) {
    return;
  }

  if (context && Object.keys(context).length > 0) {
    console.error(`${prefix} context:`, context);
  }

  if (error instanceof Error && error.stack) {
    console.error(error.stack);
  }

  if (error instanceof Error && error.cause) {
    console.error(`${prefix} caused by:`, error.cause);
  }
}

/**
 * Logs a warning the operator must see (a fixed `message`, never request data) in every
 * environment. The `context` is logged only with CAT_DEBUG=true.
 */
export function logServerWarning(handler: string, message: string, context?: Record<string, unknown>): void {
  const prefix = `[commerce-ai-tool/server] ${handler}`;
  console.warn(`${prefix}: ${message}`);

  if (isDebugEnabled() && context && Object.keys(context).length > 0) {
    console.warn(`${prefix} context:`, context);
  }
}

/** Logs only with CAT_DEBUG=true (for example deprecation notices). Never pass credentials. */
export function logServerDebug(handler: string, message: string): void {
  if (!isDebugEnabled()) {
    return;
  }
  console.warn(`[commerce-ai-tool/server] ${handler}: ${message}`);
}
