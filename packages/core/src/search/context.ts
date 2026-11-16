import { createAIProvider } from "../ai/index.js";
import type { AIProvider } from "../ai/types.js";
import {
  DEFAULT_BEDROCK_MODEL,
  DEFAULT_OPENROUTER_MODEL,
  DEFAULT_OPENROUTER_VISION_MODEL,
  DEFAULT_OPENROUTER_VOICE_MODEL,
} from "../ai/defaults.js";
import { SearchCache } from "../cache/search-cache.js";
import { DEFAULT_TIMEOUTS } from "../config/defaults.js";
import { createCommercetoolsClient } from "../commercetools/client.js";
import type { CommercetoolsClient } from "../commercetools/client.js";
import { CategoryLabelCache } from "../commercetools/category-labels.js";
import { FacetSchemaStore } from "../commercetools/product-types.js";
import { resolveSearchLocales } from "../locale/resolve.js";
import { wrapAIProvider } from "../observability/index.js";
import { configureLangfusePrompts } from "../prompts/resolve.js";
import { logSearchTrace } from "../utils/dev-trace.js";
import { createSearchTimer, shouldIncludeSearchTimings } from "../utils/search-timer.js";
import type {
  AIConfig,
  CommerceAIConfig,
  ImageSearchResult,
  ProductCard,
  ResolvedFacetSchema,
  SearchLocaleContext,
  SearchLocaleOptions,
  SearchRelaxationLevel,
  SearchResult,
  SuggestionsResult,
  VoiceMode,
  VoiceSearchResult,
} from "../types/index.js";

export interface SearchOrchestratorDeps {
  config: CommerceAIConfig;
  transcribeAudio?: (audio: Uint8Array, mimeType: string) => Promise<string>;
  aiProvider?: AIProvider;
  commercetoolsClient?: CommercetoolsClient;
  facetSchemaStore?: FacetSchemaStore;
}

export interface PipelineTimeouts {
  aiTextMs: number;
  aiVoiceAudioMs: number;
  aiImageMs: number;
  commercetoolsMs: number;
  commercetoolsSuggestMs: number;
  elevenLabsTtsMs?: number;
}

export interface InterpretedSearchCacheEntry {
  products: ProductCard[];
  total: number;
  /** Which zero-result retry produced `products`; the applied filters are re-derived from it. */
  relaxation: SearchRelaxationLevel;
  facets?: SearchResult["facets"];
}

/** Per-pipeline result caches; every member is null when `config.cache` is unset. */
export interface PipelineCaches {
  result: SearchCache<SearchResult> | null;
  /**
   * commercetools-derived fields only: the interpreted key does not carry the shopper's query,
   * so per-request fields (interpretation, queryLocale, ...) are never shared through it.
   */
  interpretedResult: SearchCache<InterpretedSearchCacheEntry> | null;
  suggestion: SearchCache<SuggestionsResult> | null;
  voiceResult: SearchCache<VoiceSearchResult & { ttsText?: string }> | null;
  imageResult: SearchCache<ImageSearchResult> | null;
}

/** Everything the search pipelines share; built once per orchestrator. */
export interface PipelineContext {
  config: CommerceAIConfig;
  ai: AIProvider;
  ct: CommercetoolsClient;
  caches: PipelineCaches;
  timeouts: PipelineTimeouts;
  facetSchemaStore: FacetSchemaStore;
  /** Null when the commercetools client cannot resolve category names. */
  categoryLabels: CategoryLabelCache | null;
  voiceMode: VoiceMode;
  /** `config.defaults` with the fallbacks the pipelines apply. */
  defaults: { limit: number; currency: string; country?: string };
  /** Speech-to-text backend supplied by the host; absent unless voice runs on ElevenLabs STT. */
  transcribeAudio?: SearchOrchestratorDeps["transcribeAudio"];
}

export function createPipelineContext(deps: SearchOrchestratorDeps): PipelineContext {
  const { config } = deps;
  configureLangfusePrompts(config.langfuse);
  const defaults = {
    limit: config.defaults?.limit ?? 20,
    currency: config.defaults?.currency ?? "EUR",
    country: config.defaults?.country,
  };
  const voiceMode = resolveVoiceMode(config);
  const timeouts = { ...DEFAULT_TIMEOUTS, ...config.timeouts };
  const caches: PipelineCaches = {
    result: config.cache ? new SearchCache<SearchResult>(config.cache) : null,
    interpretedResult: config.cache
      ? new SearchCache<InterpretedSearchCacheEntry>(config.cache)
      : null,
    suggestion: config.cache ? new SearchCache<SuggestionsResult>(config.cache) : null,
    voiceResult: config.cache
      ? new SearchCache<VoiceSearchResult & { ttsText?: string }>(config.cache)
      : null,
    imageResult: config.cache ? new SearchCache<ImageSearchResult>(config.cache) : null,
  };

  const rawAi = deps.aiProvider ?? createAIProvider(config.ai);
  const ai = wrapAIProvider(rawAi, resolveAIProviderTraceMeta(config.ai));
  const ct = deps.commercetoolsClient ?? createCommercetoolsClient(config.commercetools);
  const facetSchemaStore =
    deps.facetSchemaStore ?? new FacetSchemaStore(config.facets?.schemaTtlMs);
  const getCategoryNames = ct.getCategoryNames?.bind(ct);
  const categoryLabels = getCategoryNames ? new CategoryLabelCache(getCategoryNames) : null;

  return {
    config,
    ai,
    ct,
    caches,
    timeouts,
    facetSchemaStore,
    categoryLabels,
    voiceMode,
    defaults,
    transcribeAudio: deps.transcribeAudio,
  };
}

export function resolveVoiceMode(config: CommerceAIConfig): VoiceMode {
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
      textModel: ai.openrouter?.model ?? DEFAULT_OPENROUTER_MODEL,
      visionModel: ai.openrouter?.visionModel ?? DEFAULT_OPENROUTER_VISION_MODEL,
      voiceModel: ai.openrouter?.voiceModel ?? DEFAULT_OPENROUTER_VOICE_MODEL,
    };
  }

  return {
    provider: ai.provider,
    textModel: ai.bedrock?.modelId ?? DEFAULT_BEDROCK_MODEL,
    visionModel: ai.bedrock?.visionModelId ?? ai.bedrock?.modelId ?? DEFAULT_BEDROCK_MODEL,
  };
}

export function resolveLocales(
  ctx: PipelineContext,
  request?: SearchLocaleOptions,
): SearchLocaleContext {
  return resolveSearchLocales({ defaults: ctx.config.defaults, request });
}

export async function resolveFacetSchema(
  ctx: PipelineContext,
  locales: SearchLocaleContext,
): Promise<ResolvedFacetSchema> {
  const { config, ct } = ctx;
  return ctx.facetSchemaStore.getOrResolve(
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

export async function tryResolveFacetSchema(
  ctx: PipelineContext,
  locales: SearchLocaleContext,
): Promise<ResolvedFacetSchema | undefined> {
  try {
    return await resolveFacetSchema(ctx, locales);
  } catch (error) {
    console.warn(
      `[commerce-ai-tool/core] Unable to resolve facet schema: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
    return undefined;
  }
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

export function withTimings<T extends SearchResult>(
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
