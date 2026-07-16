import {
  SUGGESTIONS_DEFAULT_LIMIT,
  SUGGESTIONS_MAX_LIMIT,
  SUGGESTIONS_MIN_PREFIX_LENGTH,
} from "../types/index.js";

export const SUGGESTIONS_MAX_PREFIX_LENGTH = 64;

export function clampSuggestionsLimit(limit?: number): number {
  if (limit === undefined || limit === null) {
    return SUGGESTIONS_DEFAULT_LIMIT;
  }

  if (!Number.isFinite(limit)) {
    return SUGGESTIONS_DEFAULT_LIMIT;
  }

  return Math.min(Math.max(1, Math.floor(limit)), SUGGESTIONS_MAX_LIMIT);
}

export function normalizeSuggestionsPrefix(query: string): string | null {
  const trimmed = query.trim();
  if (trimmed.length < SUGGESTIONS_MIN_PREFIX_LENGTH) {
    return null;
  }

  if (trimmed.length > SUGGESTIONS_MAX_PREFIX_LENGTH) {
    return trimmed.slice(0, SUGGESTIONS_MAX_PREFIX_LENGTH);
  }

  return trimmed;
}

export function resolveSuggestLocale(queryLocale: string, catalogLocale: string): string {
  return queryLocale || catalogLocale;
}
