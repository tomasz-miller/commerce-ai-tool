import { OpenRouterError } from "@openrouter/sdk/models/errors";

/**
 * Detect a provider body that rejects `json_schema` structured output, so the caller can retry
 * with `json_object`. It must name the parameter and say it is unsupported: a 400 for a schema
 * that is merely invalid also mentions json_schema and must not trigger the fallback.
 */
export function isJsonSchemaUnsupportedMessage(body: string): boolean {
  const lower = body.toLowerCase();
  const namesParameter =
    lower.includes("json_schema") ||
    lower.includes("response_format") ||
    lower.includes("responseformat");
  if (!namesParameter) {
    return false;
  }
  return (
    lower.includes("not support") ||
    lower.includes("unsupported") ||
    lower.includes("unknown parameter")
  );
}

/** A 400 from the OpenRouter SDK whose response body says `json_schema` is unsupported. */
export function isJsonSchemaUnsupportedError(error: unknown): boolean {
  return (
    error instanceof OpenRouterError &&
    error.statusCode === 400 &&
    isJsonSchemaUnsupportedMessage(error.body)
  );
}
