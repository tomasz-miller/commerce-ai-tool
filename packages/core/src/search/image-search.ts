import { buildImageSearchCacheKey } from "../cache/search-cache.js";
import { withPropagatedAttributes, withTraceIdMeta } from "../observability/index.js";
import { logSearchTrace } from "../utils/dev-trace.js";
import { hashUint8Array } from "../utils/hash.js";
import { createSearchTimer } from "../utils/search-timer.js";
import { withTimeout } from "../utils/with-timeout.js";
import { uint8ArrayToBase64 } from "../utils/audio.js";
import type { ImageSearchResult, SearchLocaleOptions } from "../types/index.js";
import { resolveLocales, tryResolveFacetSchema, withTimings } from "./context.js";
import type { PipelineContext } from "./context.js";
import { resolveMissionOptions } from "./mission.js";
import { searchWithOptionalMission } from "./mission-search.js";
import { executeSearch } from "./product-search.js";

export interface ImageSearchRequest {
  image: Uint8Array;
  mimeType: string;
}

export type ImageSearchOptions = SearchLocaleOptions & {
  limit?: number;
  enableMissions?: boolean;
  /** Aborts every remaining step, including in-flight AI calls. */
  signal?: AbortSignal;
};

export async function searchByImage(
  ctx: PipelineContext,
  request: ImageSearchRequest,
  options: ImageSearchOptions = {},
): Promise<ImageSearchResult> {
  const { config, ai, timeouts, voiceMode } = ctx;
  const { limit } = ctx.defaults;
  const imageResultCache = ctx.caches.imageResult;
  const { image, mimeType } = request;
  const { signal } = options;
  const locales = resolveLocales(ctx, options);
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
    const missionOptions = resolveMissionOptions(config.missions, options.enableMissions);
    const imageCacheKey = buildImageSearchCacheKey(
      hashUint8Array(image),
      mimeType,
      locales.queryLocale,
      locales.catalogLocale,
      searchLimit,
      missionOptions.enabled,
    );
    const cachedImage = imageResultCache?.get(imageCacheKey);
    if (cachedImage) {
      timer.mark("cache_hit");
      return withTraceIdMeta(withTimings(cachedImage, timer));
    }

    const resolvedSchema = await tryResolveFacetSchema(ctx, locales);
    const attributeCatalog = resolvedSchema?.attributes ?? [];
    const facetSchema = config.facets?.enabled ? resolvedSchema : undefined;
    const base64 = uint8ArrayToBase64(image);
    const interpreted = await withTimeout(
      (stepSignal) =>
        ai.interpretImageQuery(base64, mimeType, locales, attributeCatalog, {
          signal: stepSignal,
        }),
      timeouts.aiImageMs,
      "ai_interpret_image",
      signal,
    );
    timer.mark("ai_interpret_image");

    // searchTerms (phrases kept intact), not the free-text interpretation: text printed in the image can
    // survive into the interpretation and would reach the mission prompt as a query.
    const missionQuery = joinPhrases(interpreted.searchTerms);
    // One phrase is one product: only call the mission model when the vision output has
    // several phrases (synonyms of one product also count; the call then runs in parallel).
    const result = await searchWithOptionalMission(
      ctx,
      missionOptions.enabled && interpreted.searchTerms.length > 1 ? missionQuery : undefined,
      () =>
        executeSearch(ctx, interpreted, {
          locales,
          limit: searchLimit,
          offset: 0,
          timer,
          facetSchema,
          signal,
        }),
      { locales, timer, missionOptions, attributeCatalog, signal },
    );
    const imageResult: ImageSearchResult = {
      ...withTimings(result, timer),
      interpretation: interpreted.interpretation,
    };
    signal?.throwIfAborted();
    imageResultCache?.set(imageCacheKey, imageResult);
    return withTraceIdMeta(imageResult);
  });
}

/**
 * Joins catalog phrases into one natural-language query ("a, b and c") without splitting any
 * phrase: the mission prompt reads "X and Y" as two product types, which a bare space would hide.
 */
function joinPhrases(phrases: string[]): string {
  if (phrases.length <= 1) {
    return phrases[0] ?? "";
  }
  return `${phrases.slice(0, -1).join(", ")} and ${phrases[phrases.length - 1]}`;
}
