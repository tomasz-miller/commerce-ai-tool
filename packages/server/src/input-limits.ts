import { MAX_QUERY_CHARS } from "@commerce-ai-tool/core/internal";
import { HttpError, ValidationError } from "./errors.js";

/**
 * Max length of `/tts` text (billed per character by the TTS provider). Defined in core,
 * which truncates server-issued `ttsText` to the same length.
 */
export { MAX_TTS_CHARS } from "@commerce-ai-tool/core/internal";

/**
 * Max length of a search `query` or `refineQuery`, and of a suggestions `query`. Defined in core,
 * whose prompt builders cut untrusted text to the same length.
 */
export { MAX_QUERY_CHARS };
export const MAX_JSON_BODY_BYTES = 64 * 1024;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
/** Image MIME types accepted by `/search/image`. */
export const ALLOWED_IMAGE_TYPES: readonly string[] = ["image/jpeg", "image/png", "image/webp"];
/** Max length of the client-generated `widgetSessionId` (Langfuse session ids are limited to 200). */
export const MAX_WIDGET_SESSION_ID_CHARS = 200;

/**
 * Returns the client-generated widget session id when it is a non-empty string of at most
 * MAX_WIDGET_SESSION_ID_CHARS characters from `A-Za-z0-9._:-` (a UUID qualifies); otherwise
 * undefined. An invalid id is dropped, never an error: it only groups traces.
 */
export function parseWidgetSessionId(value: unknown): string | undefined {
  if (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_WIDGET_SESSION_ID_CHARS &&
    /^[A-Za-z0-9._:-]+$/.test(value)
  ) {
    return value;
  }
  return undefined;
}

/** Bounds of `facetSelections`: a facet id is a group id or attribute name, a value a bucket key. */
export const MAX_FACET_SELECTION_GROUPS = 20;
export const MAX_FACET_SELECTION_VALUES = 20;
export const MAX_FACET_SELECTION_ID_CHARS = 100;
export const MAX_FACET_SELECTION_VALUE_CHARS = 200;

/**
 * Validates the optional `facetSelections` of a search request: a plain object of facet id to an
 * array of selected bucket keys, within the MAX_FACET_SELECTION_* bounds. Absent (`undefined` or
 * `null`) returns undefined, which keeps the categories-only `postFilter` behaviour. Anything
 * malformed or oversized is a 400 `VALIDATION`: a widget never sends it, and silently dropping a
 * chip would show results that ignore the shopper's selection.
 */
export function parseFacetSelections(value: unknown): Record<string, string[]> | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError("facetSelections must be an object of string arrays");
  }

  const entries = Object.entries(value);
  if (entries.length > MAX_FACET_SELECTION_GROUPS) {
    throw new ValidationError(
      `facetSelections must have at most ${MAX_FACET_SELECTION_GROUPS} groups`,
    );
  }

  const result: Record<string, string[]> = {};
  for (const [id, values] of entries) {
    if (id.length > MAX_FACET_SELECTION_ID_CHARS) {
      throw new ValidationError(
        `facetSelections group ids must be at most ${MAX_FACET_SELECTION_ID_CHARS} characters`,
      );
    }
    if (!Array.isArray(values) || values.some((entry) => typeof entry !== "string")) {
      throw new ValidationError("facetSelections must be an object of string arrays");
    }
    if (values.length > MAX_FACET_SELECTION_VALUES) {
      throw new ValidationError(
        `facetSelections must have at most ${MAX_FACET_SELECTION_VALUES} values per group`,
      );
    }
    for (const entry of values as string[]) {
      assertMaxChars(entry, MAX_FACET_SELECTION_VALUE_CHARS, "facetSelections values");
    }
    Object.defineProperty(result, id, {
      value: [...(values as string[])],
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return result;
}

/** Bounds of the client-echoed `searchTerms`: catalog-language phrases from the previous response. */
export const MAX_SEARCH_TERMS = 20;
/** Bounds of the client-echoed `suggestedFacets` (the server itself returns at most 5). */
export const MAX_SUGGESTED_FACETS = 20;
export const MAX_SUGGESTED_FACET_NAME_CHARS = 100;
const SEARCH_SORTS: readonly string[] = ["relevance", "price_asc", "price_desc"];

/**
 * Validates the optional `searchTerms` of a search request: an array of at most MAX_SEARCH_TERMS
 * non-empty strings of at most MAX_QUERY_CHARS characters each (entries are trimmed). Absent
 * (`undefined` or `null`) returns undefined. Anything else is a 400 `VALIDATION`: the terms go
 * straight into the Product Search query on the refinement path, so a non-array or non-string
 * entry would otherwise surface as a 500.
 */
export function parseSearchTerms(value: unknown): string[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new ValidationError("searchTerms must be an array of strings");
  }
  if (value.length > MAX_SEARCH_TERMS) {
    throw new ValidationError(`searchTerms must have at most ${MAX_SEARCH_TERMS} entries`);
  }
  return (value as string[]).map((entry) => {
    const trimmed = entry.trim();
    if (!trimmed) {
      throw new ValidationError("searchTerms entries must not be empty");
    }
    assertMaxChars(trimmed, MAX_QUERY_CHARS, "searchTerms entries");
    return trimmed;
  });
}

/** Validates the optional `sort`: one of `relevance`, `price_asc`, `price_desc`; otherwise 400. */
export function parseSearchSort(value: unknown): "relevance" | "price_asc" | "price_desc" | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string" || !SEARCH_SORTS.includes(value)) {
    throw new ValidationError(`sort must be one of ${SEARCH_SORTS.join(", ")}`);
  }
  return value as "relevance" | "price_asc" | "price_desc";
}

/**
 * Validates the optional `suggestedFacets`: an array of at most MAX_SUGGESTED_FACETS objects with
 * a `name` string (1 to MAX_SUGGESTED_FACET_NAME_CHARS characters) and an optional `reason`
 * string; otherwise 400. Only `name` and `reason` are kept.
 */
export function parseSuggestedFacets(
  value: unknown,
): Array<{ name: string; reason?: string }> | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const invalid = () =>
    new ValidationError("suggestedFacets must be an array of { name: string, reason?: string }");
  if (!Array.isArray(value)) {
    throw invalid();
  }
  if (value.length > MAX_SUGGESTED_FACETS) {
    throw new ValidationError(`suggestedFacets must have at most ${MAX_SUGGESTED_FACETS} entries`);
  }
  return value.map((entry: unknown) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw invalid();
    }
    const { name, reason } = entry as { name?: unknown; reason?: unknown };
    if (typeof name !== "string" || !name.trim() || (reason !== undefined && typeof reason !== "string")) {
      throw invalid();
    }
    assertMaxChars(name, MAX_SUGGESTED_FACET_NAME_CHARS, "suggestedFacets names");
    return reason === undefined ? { name } : { name, reason };
  });
}

/** commercetools Product Search accepts `limit` 0-100. */
export const MAX_SEARCH_LIMIT = 100;

/**
 * Clamps a client-supplied search `limit` to 1..MAX_SEARCH_LIMIT.
 * Non-numeric values (including NaN) fall back to `fallback`.
 */
export function clampSearchLimit(value: unknown, fallback: number): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  const candidate = Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
  return Math.min(MAX_SEARCH_LIMIT, Math.max(1, candidate));
}

/** Parses a cart line quantity: integers only, within `[min, max]`. */
export function parseQuantity(value: unknown, opts: { min: number; max: number }): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  if (!Number.isInteger(parsed)) {
    throw new ValidationError("quantity must be an integer");
  }
  if (parsed < opts.min) {
    throw new ValidationError(`quantity must be at least ${opts.min}`);
  }
  if (parsed > opts.max) {
    throw new ValidationError(`quantity must be at most ${opts.max}`);
  }
  return parsed;
}

/** Throws 400 VALIDATION when `value` is a string longer than `max` characters. */
export function assertMaxChars(value: unknown, max: number, field: string): void {
  if (typeof value === "string" && value.length > max) {
    throw new ValidationError(`${field} must be at most ${max} characters`);
  }
}

/** MIME type without parameters (`audio/webm;codecs=opus` becomes `audio/webm`), lower-cased. */
export function normalizeMimeType(value: string | null | undefined): string {
  return value?.split(";")[0]?.trim().toLowerCase() ?? "";
}

/** 413 `PAYLOAD_TOO_LARGE`; `what` and `limit` describe the capped input. */
export function payloadTooLarge(what: string, limitBytes: number): HttpError {
  return new HttpError(
    413,
    "PAYLOAD_TOO_LARGE",
    `${what} must be at most ${Math.floor(limitBytes / 1024)} KB`,
  );
}

/** `application/json`, with or without parameters such as `; charset=utf-8`. */
export function isJsonContentType(contentType: string | null | undefined): boolean {
  const mediaType = contentType?.split(";")[0]?.trim().toLowerCase();
  return mediaType === "application/json";
}

/**
 * JSON routes reject other media types. `text/plain` POSTs are CORS "simple requests"
 * that a third-party page can send without a preflight.
 */
export function assertJsonContentType(contentType: string | null | undefined): void {
  if (!isJsonContentType(contentType)) {
    throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json");
  }
}
