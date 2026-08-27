import type { InterpretedSearchQuery, SearchLocaleContext } from "../types/index.js";
import { MAX_INTERPRETED_SEARCH_TERMS } from "../prompts/index.js";

const OFF_TOPIC_PREFIX =
  /^(what|why|how|who|when|where|explain|tell me|is there|what's|whats)\b/i;

export function primaryLanguageTag(locale: string): string {
  return locale.trim().toLowerCase().split(/[-_]/)[0] ?? "";
}

export function localesShareLanguage(left: string, right: string): boolean {
  const a = primaryLanguageTag(left);
  const b = primaryLanguageTag(right);
  return Boolean(a && b && a === b);
}

/** True for short storefront queries that should still hit Product Search if AI returns nothing. */
export function isLikelyProductQuery(query: string): boolean {
  const trimmed = query.trim();
  if (trimmed.length < 2 || trimmed.length > 80) {
    return false;
  }
  if (trimmed.includes("?")) {
    return false;
  }
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 8) {
    return false;
  }
  return !OFF_TOPIC_PREFIX.test(trimmed);
}

function prependUniquePhrase(phrase: string, phrases: string[]): string[] {
  const key = phrase.toLowerCase();
  const rest = phrases.filter((item) => item.toLowerCase() !== key);
  return [phrase, ...rest].slice(0, MAX_INTERPRETED_SEARCH_TERMS);
}

/**
 * Keep the shopper's typed query in Product Search when it is the same language
 * as the catalog. Empty AI `searchTerms` still search a product-like query;
 * otherwise the typed wording is OR'd with AI phrases.
 */
export function mergeInterpretedSearchTerms(
  query: string,
  interpreted: InterpretedSearchQuery,
  locales: SearchLocaleContext,
): InterpretedSearchQuery {
  const passthrough = query.trim().replace(/\s+/g, " ");
  if (!passthrough || !isLikelyProductQuery(passthrough)) {
    return interpreted;
  }

  if (!localesShareLanguage(locales.queryLocale, locales.catalogLocale)) {
    return interpreted;
  }

  if (interpreted.searchTerms.length === 0) {
    return { ...interpreted, searchTerms: [passthrough] };
  }

  return {
    ...interpreted,
    searchTerms: prependUniquePhrase(passthrough, interpreted.searchTerms),
  };
}
