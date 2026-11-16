/**
 * Reads a commercetools SDK rejection. ts-client rejects with an `HttpError` whose `error` field
 * holds the API payload (`body` is the deprecated alias), or with `{ body: null, error: HttpError }`
 * for a network failure, so the payload is `error ?? body` and the status falls back to it.
 * Every error predicate in this package goes through this one reader.
 */
export interface CommercetoolsErrorParts {
  status?: number;
  codes: string[];
  /** The payload message, else the error's own message. */
  message?: string;
  /** Every message on the error: its own, the payload's and each payload error's. */
  messages: string[];
}

type Payload = {
  statusCode?: number;
  message?: string;
  errors?: Array<{ code?: string; message?: string }>;
};

export function commercetoolsErrorParts(error: unknown): CommercetoolsErrorParts {
  if (!error || typeof error !== "object") {
    return { codes: [], messages: [] };
  }
  const candidate = error as Payload & { error?: Payload | null; body?: Payload | null };
  const payload = candidate.error ?? candidate.body ?? undefined;
  const errors = payload?.errors ?? [];
  const codes = errors
    .map((item) => item.code)
    .filter((code): code is string => Boolean(code));
  const messages = [candidate.message, payload?.message, ...errors.map((item) => item.message)].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  return {
    status: candidate.statusCode ?? payload?.statusCode,
    codes,
    message: payload?.message ?? candidate.message,
    messages,
  };
}
