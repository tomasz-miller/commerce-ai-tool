import { buildTextSearchCacheKey } from "../cache/search-cache.js";
import { facetGroupForFilterKey } from "../commercetools/facets.js";
import { withPropagatedAttributes, withTraceIdMeta } from "../observability/index.js";
import { logSearchTrace } from "../utils/dev-trace.js";
import { createSearchTimer } from "../utils/search-timer.js";
import { withTimeout } from "../utils/with-timeout.js";
import type {
  InterpretedSearchFilters,
  InterpretedSearchQuery,
  ResolvedFacetSchema,
  SearchResult,
  TextSearchRequest,
} from "../types/index.js";
import { resolveLocales, tryResolveFacetSchema, withTimings } from "./context.js";
import type { PipelineContext } from "./context.js";
import { isUsableMission, looksLikeShoppingList, resolveMissionOptions } from "./mission.js";
import { executeMissionSearch } from "./mission-search.js";
import { executeSearch } from "./product-search.js";

export async function searchByText(
  ctx: PipelineContext,
  request: TextSearchRequest,
): Promise<SearchResult> {
  const { config, ai, timeouts, voiceMode } = ctx;
  const { limit } = ctx.defaults;
  const resultCache = ctx.caches.result;
  const { signal } = request;
  const locales = resolveLocales(ctx, request);
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
    const missionOptions = resolveMissionOptions(config.missions, request.enableMissions);
    const cacheKey = buildTextSearchCacheKey(
      JSON.stringify({
        query: request.query,
        searchTerms: request.searchTerms,
        filters: request.filters,
        facetSelections: normalizeFacetSelectionsForCache(request.facetSelections),
        sort: request.sort ?? null,
        refineQuery: request.refineQuery,
        suggestedFacets: request.suggestedFacets,
        includeFacets,
        missions: missionOptions.enabled,
        maxIntents: missionOptions.maxIntents,
        perIntentLimit: missionOptions.perIntentLimit,
        minConfidence: missionOptions.minConfidence,
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
      facetSchema = await tryResolveFacetSchema(ctx, locales);
    }

    let interpreted: InterpretedSearchQuery;
    if (request.refineQuery && request.searchTerms) {
      const refineQuery = request.refineQuery;
      const refineContext = {
        searchTerms: request.searchTerms,
        filters: request.filters ?? {},
        attributeCatalog: facetSchema?.attributes ?? [],
      };
      interpreted = await withTimeout(
        (stepSignal) =>
          ai.interpretRefineQuery(refineQuery, refineContext, locales, { signal: stepSignal }),
        timeouts.aiTextMs,
        "ai_refine",
        signal,
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
    } else if (
      missionOptions.enabled &&
      looksLikeShoppingList(request.query, locales.queryLocale)
    ) {
      // Both calls settle, as in voice and image search: a usable mission survives a failed or
      // timed-out interpret call. The interpret error is thrown only without a mission to use.
      const [interpretedSettled, missionSettled] = await Promise.allSettled([
        withTimeout(
          (stepSignal) =>
            ai.interpretTextQuery(request.query, locales, facetSchema?.attributes, {
              signal: stepSignal,
            }),
          timeouts.aiTextMs,
          "ai_interpret",
          signal,
        ),
        withTimeout(
          (stepSignal) =>
            ai.decomposeShoppingMission(request.query, locales, facetSchema?.attributes, {
              signal: stepSignal,
            }),
          timeouts.aiTextMs,
          "ai_mission",
          signal,
        ).catch(() => null),
      ]);
      signal?.throwIfAborted();
      const missionResult = missionSettled.status === "fulfilled" ? missionSettled.value : null;
      if (interpretedSettled.status === "fulfilled") {
        timer.mark("ai_interpret");
      }
      if (missionResult) {
        timer.mark("ai_mission");
      }

      const missionSearch = isUsableMission(missionResult, missionOptions.minConfidence)
        ? await executeMissionSearch(ctx, missionResult, {
            locales,
            timer,
            maxIntents: missionOptions.maxIntents,
            perIntentLimit: missionOptions.perIntentLimit,
            signal,
          })
        : null;

      if (missionSearch) {
        // Never cache a result assembled while the request was being aborted.
        signal?.throwIfAborted();
        resultCache?.set(`${cacheKey}|${request.offset ?? 0}`, missionSearch);
        return withTraceIdMeta(withTimings(missionSearch, timer));
      }

      if (interpretedSettled.status === "rejected") {
        throw interpretedSettled.reason;
      }
      interpreted = {
        ...interpretedSettled.value,
        filters: { ...(interpretedSettled.value.filters ?? {}), ...(request.filters ?? {}) },
      };
    } else {
      interpreted = await withTimeout(
        (stepSignal) =>
          ai.interpretTextQuery(request.query, locales, facetSchema?.attributes, {
            signal: stepSignal,
          }),
        timeouts.aiTextMs,
        "ai_interpret",
        signal,
      );
      interpreted = {
        ...interpreted,
        filters: { ...(interpreted.filters ?? {}), ...(request.filters ?? {}) },
      };
      timer.mark("ai_interpret");
    }

    const result = await executeSearch(ctx, interpreted, {
      locales,
      limit: searchLimit,
      offset: request.offset ?? 0,
      timer,
      facetSchema,
      originalQuery: request.query,
      signal,
      postFilterKeys: facetChipFilterKeys(
        request.filters,
        interpreted.filters,
        request.facetSelections,
        facetSchema,
      ),
      postFilterAllGroups: Boolean(request.facetSelections),
    });
    signal?.throwIfAborted();
    resultCache?.set(`${cacheKey}|${request.offset ?? 0}`, result);
    return withTraceIdMeta(withTimings(result, timer));
  });
}

/**
 * Facet groups with at least one selected value in `TextSearchRequest.facetSelections`, or
 * undefined when the request does not carry the field (an older widget).
 */
function selectedFacetGroups(
  facetSelections: Record<string, string[]> | undefined,
): Set<string> | undefined {
  if (!facetSelections) {
    return undefined;
  }
  return new Set(
    Object.entries(facetSelections)
      .filter(([, values]) => Array.isArray(values) && values.length > 0)
      .map(([group]) => group),
  );
}

/** Cache-key form of `facetSelections`: the sorted selected groups, `null` when the field is absent. */
function normalizeFacetSelectionsForCache(
  facetSelections: Record<string, string[]> | undefined,
): string[] | null {
  const groups = selectedFacetGroups(facetSelections);
  return groups ? [...groups].sort() : null;
}

/**
 * Filter keys that are facet-chip selections. Without `facetSelections` (older widgets) the
 * widget's chip state is indistinguishable from the model constraints it echoes back in
 * `TextSearchRequest.filters`, so every key of it qualifies and the builder only sends the
 * product-level `categories` group to `postFilter` (R28). With `facetSelections`, only the keys
 * of the listed groups are chips; every other filter, echoed or not, is a model constraint.
 * Either way, a chip key the refine model overrode with a different value is the model's
 * constraint, and filters the model interpreted in this request are not in `requestFilters`.
 */
function facetChipFilterKeys(
  requestFilters: InterpretedSearchFilters | undefined,
  finalFilters: InterpretedSearchFilters | undefined,
  facetSelections?: Record<string, string[]>,
  facetSchema?: ResolvedFacetSchema,
): string[] {
  const selectedGroups = selectedFacetGroups(facetSelections);
  return Object.entries(requestFilters ?? {})
    .filter(([key, value]) => Boolean(value) && finalFilters?.[key] === value)
    .filter(([key]) => !selectedGroups || selectedGroups.has(facetGroupForFilterKey(key, facetSchema)))
    .map(([key]) => key);
}
