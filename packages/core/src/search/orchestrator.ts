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
import { filterFacetSuggestions, normalizeProductSearchFacets } from "../commercetools/facets.js";
import { FacetSchemaStore } from "../commercetools/product-types.js";
import { resolveSearchLocales } from "../locale/resolve.js";
import { hasSearchableContent } from "../commercetools/query-builder.js";
import type { ProductSearchBuildInput } from "../commercetools/query-builder.js";
import {
  withPipelineSpan,
  withPropagatedAttributes,
  withTraceIdMeta,
  wrapAIProvider,
} from "../observability/index.js";
import { buildTtsSummaryFallback } from "./voice-tts.js";
import { logSearchTrace } from "../utils/dev-trace.js";
import { hashUint8Array } from "../utils/hash.js";
import { createSearchTimer, shouldIncludeSearchTimings } from "../utils/search-timer.js";
import { withTimeout } from "../utils/with-timeout.js";
import { uint8ArrayToBase64 } from "../utils/audio.js";
import type {
  AIConfig,
  CommerceAIConfig,
  ImageSearchResult,
  InterpretedSearchQuery,
  SearchLocaleContext,
  SearchLocaleOptions,
  SearchResult,
  ResolvedFacetSchema,
  SuggestionsRequest,
  SuggestionsResult,
  TextSearchRequest,
  VoiceAudioInterpretation,
  VoiceMode,
  VoiceSearchResult,
} from "../types/index.js";
import {
  clampSuggestionsLimit,
  normalizeSuggestionList,
  normalizeSuggestionsPrefix,
  resolveSuggestLocales,
  shouldUseAiSuggestionFallback,
} from "./suggestions-input.js";

export interface SearchOrchestrator {
  searchByText(request: TextSearchRequest): Promise<SearchResult>;
  getFacetSchema?(options?: SearchLocaleOptions): Promise<ResolvedFacetSchema>;
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
  facetSchemaStore?: FacetSchemaStore;
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

  const rawAi = deps.aiProvider ?? createAIProvider(config.ai);
  const ai = wrapAIProvider(rawAi, resolveAIProviderTraceMeta(config.ai));
  const ct = deps.commercetoolsClient ?? createCommercetoolsClient(config.commercetools);
  const facetSchemaStore =
    deps.facetSchemaStore ?? new FacetSchemaStore(config.facets?.schemaTtlMs);

  function resolveLocales(request?: SearchLocaleOptions): SearchLocaleContext {
    return resolveSearchLocales({ defaults: config.defaults, request });
  }

  async function resolveFacetSchema(locales: SearchLocaleContext): Promise<ResolvedFacetSchema> {
    return facetSchemaStore.getOrResolve(
      {
        projectKey: config.commercetools.projectKey,
        catalogLocale: locales.catalogLocale,
        include: config.facets?.include,
        exclude: config.facets?.exclude,
        maxAttributes: config.facets?.maxAttributes,
      },
      () => ct.listProductTypes(),
    );
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
    facetSchema?: ResolvedFacetSchema,
  ): Promise<SearchResult> {
    const interpretedCacheKey = buildInterpretedSearchCacheKey(
      JSON.stringify({
        searchTerms: interpreted.searchTerms,
        sort: interpreted.sort,
        filters: interpreted.filters,
        suggestedFacets: interpreted.suggestedFacets,
        schemaEtag: facetSchema?.etag ?? null,
        includeFacets: Boolean(facetSchema),
      }),
      locales.catalogLocale,
      searchLimit,
    );
    const cached = resultCache?.get(`${interpretedCacheKey}|${offset}`);
    if (cached) {
      timer?.mark("cache_hit");
      return withPipelineSpan(
        "commercetools.search",
        {
          metadata: { cacheHit: true },
          output: { total: cached.meta.total, productCount: cached.products.length },
        },
        async (span) => {
          span?.update({ metadata: { cacheHit: true } });
          return cached;
        },
      );
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
      facetSchema,
    };

    logSearchTrace("ai", {
      searchTerms: interpreted.searchTerms,
      filters: interpreted.filters,
      interpretation: interpreted.interpretation,
      catalogLocale: locales.catalogLocale,
    });

    return withPipelineSpan(
      "commercetools.search",
      {
        input: {
          searchTerms: interpreted.searchTerms,
          catalogLocale: locales.catalogLocale,
          limit: searchLimit,
          offset,
        },
        metadata: { cacheHit: false },
      },
      async (span) => {
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
            searchTerms: interpreted.searchTerms,
            appliedFilters: interpreted.filters,
            sort: interpreted.sort,
            ...(facetSchema ? { schemaEtag: facetSchema.etag } : {}),
          },
          ...(facetSchema
            ? {
                facetSchema: facetSchema.attributes,
                suggestedFacets: filterFacetSuggestions(interpreted.suggestedFacets, facetSchema),
                facets: normalizeProductSearchFacets(
                  searchResult.facets,
                  facetSchema,
                  interpreted.suggestedFacets,
                  interpreted.filters,
                ),
              }
            : {}),
        };

        span?.update({
          output: { total: result.meta.total, productCount: result.products.length },
        });
        resultCache?.set(`${interpretedCacheKey}|${offset}`, result);
        return result;
      },
    );
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
    async getFacetSchema(options = {}) {
      return resolveFacetSchema(resolveLocales(options));
    },

    async searchByText(request) {
      const locales = resolveLocales(request);
      const searchLimit = request.limit ?? limit;
      const timer = createSearchTimer();

      const pipelineMeta = {
        queryLocale: locales.queryLocale,
        catalogLocale: locales.catalogLocale,
        searchType: "text",
        projectKey: config.commercetools.projectKey,
        aiProvider: config.ai.provider,
        voiceMode,
      };

      return withPropagatedAttributes(pipelineMeta, async () => {
            const includeFacets = Boolean(request.includeFacets || config.facets?.enabled);
            const cacheKey = buildTextSearchCacheKey(
              JSON.stringify({
                query: request.query,
                searchTerms: request.searchTerms,
                filters: request.filters,
                refineQuery: request.refineQuery,
                suggestedFacets: request.suggestedFacets,
                includeFacets,
              }),
              locales.queryLocale,
              locales.catalogLocale,
              searchLimit,
            );
            const cached = resultCache?.get(`${cacheKey}|${request.offset ?? 0}`);
            if (cached) {
              timer.mark("cache_hit");
              return withTraceIdMeta(withTimings(cached, timer));
            }

            logSearchTrace("input", {
              query: request.query,
              queryLocale: locales.queryLocale,
              catalogLocale: locales.catalogLocale,
            });

            let facetSchema: ResolvedFacetSchema | undefined;
            if (includeFacets) {
              try {
                facetSchema = await resolveFacetSchema(locales);
              } catch (error) {
                console.warn(
                  `[commerce-ai-tool/core] Unable to resolve facet schema: ${
                    error instanceof Error ? error.message : "unknown error"
                  }`,
                );
              }
            }

            let interpreted: InterpretedSearchQuery;
            if (request.refineQuery && request.searchTerms) {
              interpreted = await withTimeout(
                ai.interpretRefineQuery(
                  request.refineQuery,
                  {
                    searchTerms: request.searchTerms,
                    filters: request.filters ?? {},
                    attributeCatalog: facetSchema?.attributes ?? [],
                  },
                  locales,
                ),
                timeouts.aiTextMs,
                "ai_refine",
              );
              interpreted = {
                ...interpreted,
                searchTerms: interpreted.searchTerms.length
                  ? interpreted.searchTerms
                  : request.searchTerms,
                filters: { ...(request.filters ?? {}), ...(interpreted.filters ?? {}) },
                suggestedFacets: interpreted.suggestedFacets?.length
                  ? interpreted.suggestedFacets
                  : request.suggestedFacets,
              };
              timer.mark("ai_refine");
            } else if (request.searchTerms) {
              interpreted = {
                searchTerms: request.searchTerms,
                filters: request.filters,
                sort: request.sort,
                interpretation: request.query,
                suggestedFacets: request.suggestedFacets,
              };
            } else {
              interpreted = await withTimeout(
                ai.interpretTextQuery(request.query, locales, facetSchema?.attributes),
                timeouts.aiTextMs,
                "ai_interpret",
              );
              interpreted = {
                ...interpreted,
                filters: { ...(interpreted.filters ?? {}), ...(request.filters ?? {}) },
              };
              timer.mark("ai_interpret");
            }

            const result = await executeSearch(
              interpreted,
              locales,
              searchLimit,
              request.offset ?? 0,
              timer,
              facetSchema,
            );
            resultCache?.set(`${cacheKey}|${request.offset ?? 0}`, result);
            return withTraceIdMeta(withTimings(result, timer));
      });
    },

    async searchByVoice(audio, mimeType, options = {}) {
      const locales = resolveLocales(options);
      const searchLimit = options.limit ?? limit;
      const timer = createSearchTimer();

      const pipelineMeta = {
        queryLocale: locales.queryLocale,
        catalogLocale: locales.catalogLocale,
        searchType: "voice",
        projectKey: config.commercetools.projectKey,
        aiProvider: config.ai.provider,
        voiceMode,
      };

      logSearchTrace("input", {
        type: "voice",
        mimeType,
        voiceMode,
        queryLocale: locales.queryLocale,
        catalogLocale: locales.catalogLocale,
      });

      return withPropagatedAttributes(pipelineMeta, async () => {
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
              return withTraceIdMeta(withTimings(cachedVoice, timer));
            }

            const voiceInterpretation = await interpretVoice(audio, mimeType, locales, timer);
            const { transcript, enhancedQuery, ...interpreted } = voiceInterpretation;
            const result = await executeSearch(interpreted, locales, searchLimit, 0, timer);

            const voiceResult: VoiceSearchResult & { ttsText?: string } = {
              ...result,
              transcript,
              enhancedQuery,
            };

            const withTts = await attachVoiceTts(
              voiceResult,
              options,
              locales,
              ai,
              timer,
              timeouts.aiTextMs,
            );
            voiceResultCache?.set(voiceCacheKey, withTts);
            return withTraceIdMeta(withTimings(withTts, timer));
      });
    },

    async searchByImage(image, mimeType, options = {}) {
      const locales = resolveLocales(options);
      const searchLimit = options.limit ?? limit;
      const timer = createSearchTimer();

      const pipelineMeta = {
        queryLocale: locales.queryLocale,
        catalogLocale: locales.catalogLocale,
        searchType: "image",
        projectKey: config.commercetools.projectKey,
        aiProvider: config.ai.provider,
        voiceMode,
      };

      logSearchTrace("input", {
        type: "image",
        mimeType,
        queryLocale: locales.queryLocale,
        catalogLocale: locales.catalogLocale,
      });

      return withPropagatedAttributes(pipelineMeta, async () => {
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
              return withTraceIdMeta(withTimings(cachedImage, timer));
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
            return withTraceIdMeta(imageResult);
      });
    },

    async suggestByText(request) {
      const locales = resolveLocales(request);
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

      let suggestions = await withTimeout(
        ct.suggestSearchTerms(trimmed, suggestLocales, suggestLimit),
        timeouts.commercetoolsSuggestMs,
        "ct_suggest",
      );

      let aiFallbackUsed = false;
      if (suggestions.length === 0 && aiEligible) {
        aiFallbackUsed = true;
        try {
          suggestions = await withTimeout(
            ai.suggestSearchTerms(trimmed, locales, suggestLimit),
            timeouts.aiTextMs,
            "ai_suggest",
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
      suggestionCache?.set(cacheKey, { suggestions: normalized });
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

function resolveAIProviderTraceMeta(ai: AIConfig) {
  if (ai.provider === "openrouter") {
    return {
      provider: ai.provider,
      textModel: ai.openrouter?.model,
      visionModel: ai.openrouter?.visionModel ?? ai.openrouter?.model,
      voiceModel: ai.openrouter?.voiceModel,
    };
  }

  return {
    provider: ai.provider,
    textModel: ai.bedrock?.modelId,
    visionModel: ai.bedrock?.visionModelId ?? ai.bedrock?.modelId,
  };
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
