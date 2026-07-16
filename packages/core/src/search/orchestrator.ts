import { createAIProvider } from "../ai/index.js";
import type { AIProvider } from "../ai/types.js";
import {
  SearchCache,
  buildImageSearchCacheKey,
  buildInterpretedSearchCacheKey,
  buildSuggestionsCacheKey,
  buildTextSearchCacheKey,
  buildVoiceSearchCacheKey,
} from "../cache/search-cache.js";
import { createCommercetoolsClient } from "../commercetools/client.js";
import type { CommercetoolsClient } from "../commercetools/client.js";
import { resolveSearchLocales } from "../locale/resolve.js";
import { hasSearchableContent } from "../commercetools/query-builder.js";
import type { ProductSearchBuildInput } from "../commercetools/query-builder.js";
import { buildTtsSummaryFallback } from "./voice-tts.js";
import { logSearchTrace } from "../utils/dev-trace.js";
import { hashUint8Array } from "../utils/hash.js";
import { createSearchTimer, shouldIncludeSearchTimings } from "../utils/search-timer.js";
import { withTimeout } from "../utils/with-timeout.js";
import { uint8ArrayToBase64 } from "../utils/audio.js";
import type {
  CommerceAIConfig,
  ImageSearchResult,
  InterpretedSearchQuery,
  SearchLocaleContext,
  SearchLocaleOptions,
  SearchResult,
  SuggestionsRequest,
  SuggestionsResult,
  TextSearchRequest,
  VoiceAudioInterpretation,
  VoiceMode,
  VoiceSearchResult,
} from "../types/index.js";
import {
  clampSuggestionsLimit,
  normalizeSuggestionsPrefix,
  resolveSuggestLocale,
} from "./suggestions-input.js";

export interface SearchOrchestrator {
  searchByText(request: TextSearchRequest): Promise<SearchResult>;
  searchByVoice(
    audio: Uint8Array,
    mimeType: string,
    options?: SearchLocaleOptions & { limit?: number; enableTts?: boolean },
  ): Promise<VoiceSearchResult & { ttsText?: string }>;
  searchByImage(
    image: Uint8Array,
    mimeType: string,
    options?: SearchLocaleOptions & { limit?: number },
  ): Promise<ImageSearchResult>;
  suggestByText(request: SuggestionsRequest): Promise<SuggestionsResult>;
}

export interface SearchOrchestratorDeps {
  config: CommerceAIConfig;
  transcribeAudio?: (audio: Uint8Array, mimeType: string) => Promise<string>;
  aiProvider?: AIProvider;
  commercetoolsClient?: CommercetoolsClient;
}

const DEFAULT_TIMEOUTS = {
  aiTextMs: 15_000,
  aiVoiceAudioMs: 20_000,
  aiImageMs: 15_000,
  commercetoolsMs: 8_000,
  commercetoolsSuggestMs: 3_000,
} as const;

export function createSearchOrchestrator(deps: SearchOrchestratorDeps): SearchOrchestrator {
  const { config } = deps;
  const limit = config.defaults?.limit ?? 20;
  const currency = config.defaults?.currency ?? "EUR";
  const voiceMode = resolveVoiceMode(config);
  const timeouts = { ...DEFAULT_TIMEOUTS, ...config.timeouts };
  const resultCache = config.cache ? new SearchCache<SearchResult>(config.cache) : null;
  const suggestionCache = config.cache ? new SearchCache<SuggestionsResult>(config.cache) : null;
  const voiceResultCache = config.cache
    ? new SearchCache<VoiceSearchResult & { ttsText?: string }>(config.cache)
    : null;
  const imageResultCache = config.cache ? new SearchCache<ImageSearchResult>(config.cache) : null;

  const ai = deps.aiProvider ?? createAIProvider(config.ai);
  const ct = deps.commercetoolsClient ?? createCommercetoolsClient(config.commercetools);

  function resolveLocales(request?: SearchLocaleOptions): SearchLocaleContext {
    return resolveSearchLocales({ defaults: config.defaults, request });
  }

  function finishTimings(timer: ReturnType<typeof createSearchTimer>) {
    if (!shouldIncludeSearchTimings()) {
      return {};
    }

    const timings = timer.finish();
    logSearchTrace("timings", {
      steps: timings.steps,
      totalMs: timings.totalMs,
    });
    return {
      timings: timings.steps,
      totalMs: timings.totalMs,
    };
  }

  function withTimings<T extends SearchResult>(
    result: T,
    timer: ReturnType<typeof createSearchTimer>,
  ): T {
    return {
      ...result,
      meta: {
        ...result.meta,
        ...finishTimings(timer),
      },
    };
  }

  async function executeSearch(
    interpreted: InterpretedSearchQuery,
    locales: SearchLocaleContext,
    searchLimit: number,
    offset = 0,
    timer?: ReturnType<typeof createSearchTimer>,
  ): Promise<SearchResult> {
    const interpretedCacheKey = buildInterpretedSearchCacheKey(
      JSON.stringify({
        searchTerms: interpreted.searchTerms,
        sort: interpreted.sort,
        filters: interpreted.filters,
      }),
      locales.catalogLocale,
      searchLimit,
    );
    const cached = resultCache?.get(`${interpretedCacheKey}|${offset}`);
    if (cached) {
      timer?.mark("cache_hit");
      return cached;
    }

    if (!hasSearchableContent(interpreted)) {
      return {
        products: [],
        meta: {
          total: 0,
          limit: searchLimit,
          offset,
          locale: locales.catalogLocale,
          catalogLocale: locales.catalogLocale,
          queryLocale: locales.queryLocale,
          queryInterpretation: interpreted.interpretation,
        },
      };
    }

    const searchInput: ProductSearchBuildInput = {
      interpreted,
      catalogLocale: locales.catalogLocale,
      limit: searchLimit,
      offset,
      options: {
        currency,
        storeKey: config.defaults?.storeKey,
        storeScopeEnabled: false,
      },
    };

    logSearchTrace("ai", {
      searchTerms: interpreted.searchTerms,
      filters: interpreted.filters,
      interpretation: interpreted.interpretation,
      catalogLocale: locales.catalogLocale,
    });

    const searchResult = await withTimeout(
      ct.searchProducts(searchInput, { currency, locale: locales.catalogLocale }),
      timeouts.commercetoolsMs,
      "ct_search",
    );
    timer?.mark("ct_search");

    let products = searchResult.projections;
    if (!products) {
      products = await withTimeout(
        ct.getProductProjections(productIdsFrom(searchResult), locales.catalogLocale, currency),
        timeouts.commercetoolsMs,
        "ct_projections",
      );
      timer?.mark("ct_projections");
    }

    const result: SearchResult = {
      products,
      meta: {
        total: searchResult.total,
        limit: searchLimit,
        offset,
        locale: locales.catalogLocale,
        catalogLocale: locales.catalogLocale,
        queryLocale: locales.queryLocale,
        queryInterpretation: interpreted.interpretation,
      },
    };

    resultCache?.set(`${interpretedCacheKey}|${offset}`, result);
    return result;
  }

  async function interpretVoice(
    audio: Uint8Array,
    mimeType: string,
    locales: SearchLocaleContext,
    timer: ReturnType<typeof createSearchTimer>,
  ): Promise<VoiceAudioInterpretation> {
    if (voiceMode === "openrouter-audio") {
      if (config.ai.provider !== "openrouter") {
        throw new Error("CAT_VOICE_MODE=openrouter-audio requires CAT_AI_PROVIDER=openrouter");
      }

      const result = await withTimeout(
        ai.interpretVoiceAudio(audio, mimeType, locales),
        timeouts.aiVoiceAudioMs,
        "ai_voice_audio",
      );
      timer.mark("ai_voice_audio");
      return result;
    }

    if (!deps.transcribeAudio) {
      throw new Error(
        "Voice search requires ElevenLabs STT (CAT_VOICE_MODE=elevenlabs-stt) or OpenRouter audio (CAT_VOICE_MODE=openrouter-audio)",
      );
    }

    const transcript = await withTimeout(
      deps.transcribeAudio(audio, mimeType),
      timeouts.aiVoiceAudioMs,
      "stt",
    );
    timer.mark("stt");

    const enhancedQuery = await withTimeout(
      ai.enhanceVoiceTranscript(transcript, locales),
      timeouts.aiTextMs,
      "ai_enhance",
    );
    timer.mark("ai_enhance");

    const interpreted = await withTimeout(
      ai.interpretTextQuery(enhancedQuery, locales),
      timeouts.aiTextMs,
      "ai_interpret",
    );
    timer.mark("ai_interpret");

    return {
      transcript,
      enhancedQuery,
      ...interpreted,
    };
  }

  return {
    async searchByText(request) {
      const locales = resolveLocales(request);
      const searchLimit = request.limit ?? limit;
      const timer = createSearchTimer();

      const cacheKey = buildTextSearchCacheKey(
        request.query,
        locales.queryLocale,
        locales.catalogLocale,
        searchLimit,
      );
      const cached = resultCache?.get(`${cacheKey}|${request.offset ?? 0}`);
      if (cached) {
        timer.mark("cache_hit");
        return withTimings(cached, timer);
      }

      logSearchTrace("input", {
        query: request.query,
        queryLocale: locales.queryLocale,
        catalogLocale: locales.catalogLocale,
      });

      const interpreted = await withTimeout(
        ai.interpretTextQuery(request.query, locales),
        timeouts.aiTextMs,
        "ai_interpret",
      );
      timer.mark("ai_interpret");

      const result = await executeSearch(
        interpreted,
        locales,
        searchLimit,
        request.offset ?? 0,
        timer,
      );
      resultCache?.set(`${cacheKey}|${request.offset ?? 0}`, result);
      return withTimings(result, timer);
    },

    async searchByVoice(audio, mimeType, options = {}) {
      const locales = resolveLocales(options);
      const searchLimit = options.limit ?? limit;
      const timer = createSearchTimer();

      logSearchTrace("input", {
        type: "voice",
        mimeType,
        voiceMode,
        queryLocale: locales.queryLocale,
        catalogLocale: locales.catalogLocale,
      });

      const enableTts = options.enableTts !== false;
      const voiceCacheKey = buildVoiceSearchCacheKey(
        hashUint8Array(audio),
        mimeType,
        voiceMode,
        locales.queryLocale,
        locales.catalogLocale,
        searchLimit,
        enableTts,
      );
      const cachedVoice = voiceResultCache?.get(voiceCacheKey);
      if (cachedVoice) {
        timer.mark("cache_hit");
        return withTimings(cachedVoice, timer);
      }

      const voiceInterpretation = await interpretVoice(audio, mimeType, locales, timer);
      const { transcript, enhancedQuery, ...interpreted } = voiceInterpretation;
      const result = await executeSearch(interpreted, locales, searchLimit, 0, timer);

      const voiceResult: VoiceSearchResult & { ttsText?: string } = {
        ...result,
        transcript,
        enhancedQuery,
      };

      const withTts = await attachVoiceTts(voiceResult, options, locales, ai, timer, timeouts.aiTextMs);
      voiceResultCache?.set(voiceCacheKey, withTts);
      return withTimings(withTts, timer);
    },

    async searchByImage(image, mimeType, options = {}) {
      const locales = resolveLocales(options);
      const searchLimit = options.limit ?? limit;
      const timer = createSearchTimer();

      logSearchTrace("input", {
        type: "image",
        mimeType,
        queryLocale: locales.queryLocale,
        catalogLocale: locales.catalogLocale,
      });

      const imageCacheKey = buildImageSearchCacheKey(
        hashUint8Array(image),
        mimeType,
        locales.queryLocale,
        locales.catalogLocale,
        searchLimit,
      );
      const cachedImage = imageResultCache?.get(imageCacheKey);
      if (cachedImage) {
        timer.mark("cache_hit");
        return withTimings(cachedImage, timer);
      }

      const base64 = uint8ArrayToBase64(image);
      const interpreted = await withTimeout(
        ai.interpretImageQuery(base64, mimeType, locales),
        timeouts.aiImageMs,
        "ai_interpret_image",
      );
      timer.mark("ai_interpret_image");

      const result = await executeSearch(interpreted, locales, searchLimit, 0, timer);
      const imageResult: ImageSearchResult = {
        ...withTimings(result, timer),
        interpretation: interpreted.interpretation,
      };
      imageResultCache?.set(imageCacheKey, imageResult);
      return imageResult;
    },

    async suggestByText(request) {
      const locales = resolveLocales(request);
      const trimmed = normalizeSuggestionsPrefix(request.query);
      const suggestLimit = clampSuggestionsLimit(request.limit);

      if (!trimmed) {
        return { suggestions: [] };
      }

      const suggestLocale = resolveSuggestLocale(locales.queryLocale, locales.catalogLocale);
      const cacheKey = buildSuggestionsCacheKey(trimmed, suggestLocale, suggestLimit);
      const cached = suggestionCache?.get(cacheKey);
      if (cached) {
        return cached;
      }

      logSearchTrace("input", {
        type: "suggest",
        query: trimmed,
        queryLocale: locales.queryLocale,
        catalogLocale: locales.catalogLocale,
        suggestLocale,
      });

      const suggestions = await withTimeout(
        ct.suggestSearchTerms(trimmed, suggestLocale, suggestLimit),
        timeouts.commercetoolsSuggestMs,
        "ct_suggest",
      );

      const result: SuggestionsResult = { suggestions };
      suggestionCache?.set(cacheKey, result);
      return result;
    },
  };
}

function resolveVoiceMode(config: CommerceAIConfig): VoiceMode {
  if (config.voiceMode) {
    return config.voiceMode;
  }

  if (config.ai.provider === "openrouter") {
    return "openrouter-audio";
  }

  return "elevenlabs-stt";
}

function productIdsFrom(searchResult: { productIds: string[] }): string[] {
  return searchResult.productIds;
}

async function attachVoiceTts(
  result: VoiceSearchResult & { ttsText?: string },
  options: { enableTts?: boolean },
  locales: SearchLocaleContext,
  ai: AIProvider,
  timer: ReturnType<typeof createSearchTimer>,
  aiTextTimeoutMs: number,
): Promise<VoiceSearchResult & { ttsText?: string }> {
  if (options.enableTts === false) {
    return result;
  }

  if (result.ttsText) {
    return result;
  }

  try {
    const ttsText = await withTimeout(
      ai.summarizeVoiceResults(result.products.length, result.products[0]?.name, locales),
      aiTextTimeoutMs,
      "ai_tts_summary",
    );
    timer.mark("ai_tts_summary");
    return { ...result, ttsText };
  } catch {
    timer.mark("ai_tts_summary_fallback");
    return {
      ...result,
      ttsText: buildTtsSummaryFallback(
        result.products.length,
        result.products[0]?.name,
        locales.queryLocale,
      ),
    };
  }
}
