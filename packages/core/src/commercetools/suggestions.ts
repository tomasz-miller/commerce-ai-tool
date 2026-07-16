import type { SuggestionResult } from "@commercetools/platform-sdk";

export function normalizeSearchSuggestions(
  result: SuggestionResult,
  locale: string,
  limit: number,
): string[] {
  const key = `searchKeywords.${locale}`;
  const suggestions = result[key] ?? [];

  const seen = new Set<string>();
  const normalized: string[] = [];

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
      break;
    }
  }

  return normalized;
}
