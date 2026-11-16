import type { ApiErrorCode } from "@commerce-ai-tool/core";

/**
 * Error whose message is safe to return to the browser as-is.
 * Anything that is not an `HttpError` (or a known core error) is reported as a generic 500.
 */
export class HttpError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;

  constructor(status: number, code: ApiErrorCode, publicMessage: string) {
    super(publicMessage);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

export class ValidationError extends HttpError {
  constructor(message: string) {
    super(400, "VALIDATION", message);
    this.name = "ValidationError";
  }
}

/**
 * Reads and validates a JSON request body. Malformed JSON and non-object payloads
 * (`null`, arrays, primitives) are client errors, not server faults.
 */
export async function parseJsonBody(read: () => Promise<unknown>): Promise<unknown> {
  let body: unknown;
  try {
    body = await read();
  } catch {
    throw new ValidationError("Invalid JSON body");
  }

  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new ValidationError("Invalid JSON body");
  }

  return body;
}
