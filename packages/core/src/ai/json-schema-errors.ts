/** Detect when OpenRouter rejected `json_schema` so we can retry `json_object`. */

export function isJsonSchemaUnsupportedMessage(body: string): boolean {
  const lower = body.toLowerCase();
  if (lower.includes("json_schema")) {
    return true;
  }
  if (!lower.includes("response_format") && !lower.includes("responseformat")) {
    return false;
  }
  return (
    lower.includes("not support") ||
    lower.includes("unsupported") ||
    lower.includes("unknown")
  );
}

export function isJsonSchemaUnsupportedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return isJsonSchemaUnsupportedMessage(message);
}
