import {
  SUGGESTIONS_DEFAULT_LIMIT,
  SUGGESTIONS_MAX_LIMIT,
  SUGGESTIONS_MIN_PREFIX_LENGTH,
} from "../types/index.js";

export const SUGGESTIONS_MAX_PREFIX_LENGTH = 64;

/** Minimum length before AI suggestion fallback may run (after CT Suggest is empty). */
export const AI_SUGGESTION_FALLBACK_MIN_LENGTH = 4;

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

/**
 * Locale for CT Search Term Suggestions (`searchKeywords.{locale}`).
 * Keywords are product catalog data, so catalog locale wins over query locale.
 */
export function resolveSuggestLocale(queryLocale: string, catalogLocale: string): string {
  return catalogLocale || queryLocale;
}

/**
 * Locales to query for suggestions. Catalog first; query locale included when different
 * so bilingual `searchKeywords` catalogs still match user-language prefixes.
 */
export function resolveSuggestLocales(queryLocale: string, catalogLocale: string): string[] {
  const primary = resolveSuggestLocale(queryLocale, catalogLocale);
  if (!primary) {
    return queryLocale ? [queryLocale] : [];
  }

  if (queryLocale && queryLocale !== primary) {
    return [primary, queryLocale];
  }

  return [primary];
}

/**
 * When CT Suggest returns nothing, AI may propose catalog-language phrases for
 * cross-locale or multi-word natural-language input.
 */
export function shouldUseAiSuggestionFallback(
  query: string,
  queryLocale: string,
  catalogLocale: string,
): boolean {
  const trimmed = query.trim();
  if (trimmed.length < AI_SUGGESTION_FALLBACK_MIN_LENGTH) {
    return false;
  }

  const localesDiffer = Boolean(
    queryLocale && catalogLocale && queryLocale !== catalogLocale,
  );
  const isMultiToken = /\s/.test(trimmed);

  return localesDiffer || isMultiToken;
}

/** Trim, drop empties, dedupe case-insensitively, clamp to limit. */
export function normalizeSuggestionList(suggestions: string[], limit: number): string[] {
  const capped = clampSuggestionsLimit(limit);
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of suggestions) {
    const text = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
    if (!text) {
      continue;
    }

    const key = text.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(text);
    if (result.length >= capped) {
      break;
    }
  }

  return result;
}
