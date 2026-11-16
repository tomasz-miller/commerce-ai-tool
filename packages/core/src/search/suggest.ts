import { buildSuggestionsCacheKey } from "../cache/search-cache.js";
import { logSearchTrace } from "../utils/dev-trace.js";
import { withTimeout } from "../utils/with-timeout.js";
import type { SuggestionsRequest, SuggestionsResult } from "../types/index.js";
import { resolveLocales } from "./context.js";
import type { PipelineContext } from "./context.js";
import {
  clampSuggestionsLimit,
  filterSuggestionsByQueryTokens,
  normalizeSuggestionList,
  normalizeSuggestionsPrefix,
  resolveSuggestLocales,
  shouldUseAiSuggestionFallback,
  suggestionPrefixes,
} from "./suggestions-input.js";

export async function suggestByText(
  ctx: PipelineContext,
  request: SuggestionsRequest,
): Promise<SuggestionsResult> {
  const { ai, ct, timeouts } = ctx;
  const suggestionCache = ctx.caches.suggestion;
  const { signal } = request;
  const locales = resolveLocales(ctx, request);
  const trimmed = normalizeSuggestionsPrefix(request.query);
  const suggestLimit = clampSuggestionsLimit(request.limit);

  if (!trimmed) {
    return { suggestions: [] };
  }

  const suggestLocales = resolveSuggestLocales(locales.queryLocale, locales.catalogLocale);
  const aiEligible = shouldUseAiSuggestionFallback(
    trimmed,
    locales.queryLocale,
    locales.catalogLocale,
  );
  const cacheKey = `${buildSuggestionsCacheKey(
    trimmed,
    suggestLocales.join(","),
    suggestLimit,
  )}${aiEligible ? "|ai" : ""}`;
  const cached = suggestionCache?.get(cacheKey);
  if (cached) {
    // Cache hits never re-run AI; omit aiFallbackUsed so hosts skip Langfuse flush.
    return { suggestions: cached.suggestions };
  }

  logSearchTrace("input", {
    type: "suggest",
    query: trimmed,
    queryLocale: locales.queryLocale,
    catalogLocale: locales.catalogLocale,
    suggestLocales,
    aiEligible,
  });

  let suggestions: string[] = [];
  const prefixes = suggestionPrefixes(trimmed);
  for (const [index, prefix] of prefixes.entries()) {
    const raw = await withTimeout(
      () => ct.suggestSearchTerms(prefix, suggestLocales, suggestLimit),
      timeouts.commercetoolsSuggestMs,
      "ct_suggest",
      signal,
    );
    const kept =
      index === 0 ? raw : filterSuggestionsByQueryTokens(raw, trimmed);
    if (kept.length > 0) {
      suggestions = kept;
      break;
    }
  }

  let aiFallbackUsed = false;
  if (suggestions.length === 0 && aiEligible) {
    aiFallbackUsed = true;
    try {
      suggestions = await withTimeout(
        (stepSignal) =>
          ai.suggestSearchTerms(trimmed, locales, suggestLimit, { signal: stepSignal }),
        timeouts.aiTextMs,
        "ai_suggest",
        signal,
      );
    } catch (error) {
      logSearchTrace("ai_suggest_fallback_failed", {
        message: error instanceof Error ? error.message : "unknown error",
      });
      suggestions = [];
    }
  }

  const normalized = normalizeSuggestionList(suggestions, suggestLimit);
  const result: SuggestionsResult = {
    suggestions: normalized,
    ...(aiFallbackUsed ? { aiFallbackUsed: true } : {}),
  };
  signal?.throwIfAborted();
  suggestionCache?.set(cacheKey, { suggestions: normalized });
  return result;
}
