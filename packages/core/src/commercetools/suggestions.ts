import type { SuggestionResult } from "@commercetools/platform-sdk";

export function normalizeSearchSuggestions(
  result: SuggestionResult,
  localeOrLocales: string | string[],
  limit: number,
): string[] {
  const locales = Array.isArray(localeOrLocales) ? localeOrLocales : [localeOrLocales];
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const locale of locales) {
    const key = `searchKeywords.${locale}`;
    const suggestions = result[key] ?? [];

    for (const suggestion of suggestions) {
      const text = suggestion.text?.trim();
      if (!text) {
        continue;
      }

      const dedupeKey = text.toLowerCase();
      if (seen.has(dedupeKey)) {
        continue;
      }

      seen.add(dedupeKey);
      normalized.push(text);

      if (normalized.length >= limit) {
        return normalized;
      }
    }
  }

  return normalized;
}
