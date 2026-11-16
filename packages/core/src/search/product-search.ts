import { buildInterpretedSearchCacheKey } from "../cache/search-cache.js";
import {
  applyCategoryLabels,
  categoryBucketIds,
  filterFacetSuggestions,
  normalizeProductSearchFacets,
} from "../commercetools/facets.js";
import { hasSearchableContent } from "../commercetools/query-builder.js";
import type { ProductSearchBuildInput } from "../commercetools/query-builder.js";
import { withPipelineSpan } from "../observability/index.js";
import { logSearchTrace } from "../utils/dev-trace.js";
import type { createSearchTimer } from "../utils/search-timer.js";
import { withTimeout } from "../utils/with-timeout.js";
import type {
  InterpretedSearchQuery,
  ResolvedFacetSchema,
  SearchFacetGroup,
  SearchLocaleContext,
  SearchRelaxationLevel,
  SearchResult,
} from "../types/index.js";
import type { InterpretedSearchCacheEntry, PipelineContext } from "./context.js";
import { mergeInterpretedSearchTerms } from "./query-passthrough.js";
import { relaxInterpretedSearch } from "./relax-search.js";

export interface ProductSearchOptions {
  locales: SearchLocaleContext;
  limit: number;
  offset?: number;
  timer?: ReturnType<typeof createSearchTimer>;
  facetSchema?: ResolvedFacetSchema;
  /** The shopper's own query: merged into the interpreted search terms when set. */
  originalQuery?: string;
  signal?: AbortSignal;
  postFilterKeys?: string[];
  postFilterAllGroups?: boolean;
}

/** Category facet buckets carry ids; show localized names, falling back to the id. */
async function labelCategoryFacets(
  ctx: PipelineContext,
  facets: SearchFacetGroup[],
  catalogLocale: string,
  signal?: AbortSignal,
): Promise<SearchFacetGroup[]> {
  const { categoryLabels, timeouts } = ctx;
  const ids = categoryBucketIds(facets);
  if (!categoryLabels || ids.length === 0) {
    return facets;
  }
  try {
    const names = await withTimeout(
      () => categoryLabels.resolve(ids, catalogLocale),
      timeouts.commercetoolsMs,
      "ct_category_names",
      signal,
    );
    return applyCategoryLabels(facets, names);
  } catch (error) {
    signal?.throwIfAborted();
    console.warn(
      `[commerce-ai-tool/core] Category labels unavailable; showing category ids: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
    return facets;
  }
}

export async function executeSearch(
  ctx: PipelineContext,
  interpreted: InterpretedSearchQuery,
  options: ProductSearchOptions,
): Promise<SearchResult> {
  const { config, ct, timeouts } = ctx;
  const { currency, country } = ctx.defaults;
  const interpretedResultCache = ctx.caches.interpretedResult;
  const {
    locales,
    limit: searchLimit,
    offset = 0,
    timer,
    facetSchema,
    originalQuery,
    signal,
    postFilterKeys = [],
    postFilterAllGroups = false,
  } = options;
  const resolved = originalQuery
    ? mergeInterpretedSearchTerms(originalQuery, interpreted, locales)
    : interpreted;

  logSearchTrace("ai", {
    searchTerms: resolved.searchTerms,
    filters: resolved.filters,
    interpretation: resolved.interpretation,
    catalogLocale: locales.catalogLocale,
  });

  const interpretedCacheKey = buildInterpretedSearchCacheKey(
    JSON.stringify({
      searchTerms: resolved.searchTerms,
      primaryTerm: resolved.primaryTerm ?? null,
      sort: resolved.sort,
      filters: resolved.filters,
      suggestedFacets: resolved.suggestedFacets,
      schemaEtag: facetSchema?.etag ?? null,
      includeFacets: Boolean(facetSchema),
      postFilterKeys: [...postFilterKeys].sort(),
      postFilterAllGroups,
    }),
    locales.catalogLocale,
    searchLimit,
  );
  const buildResult = (entry: InterpretedSearchCacheEntry): SearchResult => {
    const appliedFilters =
      entry.relaxation === "none"
        ? resolved.filters
        : (relaxInterpretedSearch(resolved, entry.relaxation)?.filters ?? resolved.filters);
    return {
      products: entry.products,
      meta: {
        total: entry.total,
        limit: searchLimit,
        offset,
        locale: locales.catalogLocale,
        catalogLocale: locales.catalogLocale,
        queryLocale: locales.queryLocale,
        queryInterpretation: resolved.interpretation,
        searchTerms: resolved.searchTerms,
        ...(resolved.primaryTerm ? { primaryTerm: resolved.primaryTerm } : {}),
        appliedFilters,
        ...(entry.relaxation !== "none" ? { relaxation: entry.relaxation } : {}),
        sort: resolved.sort,
        ...(facetSchema ? { schemaEtag: facetSchema.etag } : {}),
      },
      ...(facetSchema
        ? {
            facetSchema: facetSchema.attributes,
            suggestedFacets: filterFacetSuggestions(resolved.suggestedFacets, facetSchema),
            facets: entry.facets,
          }
        : {}),
    };
  };

  const cached = interpretedResultCache?.get(`${interpretedCacheKey}|${offset}`);
  if (cached) {
    timer?.mark("cache_hit");
    return withPipelineSpan(
      "commercetools.search",
      {
        metadata: { cacheHit: true },
        output: { total: cached.total, productCount: cached.products.length },
      },
      (span) => {
        span?.update({ metadata: { cacheHit: true } });
        return Promise.resolve(buildResult(cached));
      },
    );
  }

  if (!hasSearchableContent(resolved)) {
    logSearchTrace("skipped", { reason: "no_searchable_content" });
    return {
      products: [],
      meta: {
        total: 0,
        limit: searchLimit,
        offset,
        locale: locales.catalogLocale,
        catalogLocale: locales.catalogLocale,
        queryLocale: locales.queryLocale,
        queryInterpretation: resolved.interpretation,
      },
    };
  }

  const searchInput: ProductSearchBuildInput = {
    interpreted: resolved,
    catalogLocale: locales.catalogLocale,
    limit: searchLimit,
    offset,
    options: {
      currency,
      storeKey: config.defaults?.storeKey,
      storeScopeEnabled: false,
    },
    facetSchema,
    ...(postFilterKeys.length > 0 ? { postFilterKeys } : {}),
    ...(postFilterAllGroups ? { postFilterAllGroups } : {}),
  };

  return withPipelineSpan(
    "commercetools.search",
    {
      input: {
        searchTerms: resolved.searchTerms,
        primaryTerm: resolved.primaryTerm,
        catalogLocale: locales.catalogLocale,
        limit: searchLimit,
        offset,
      },
      metadata: { cacheHit: false },
    },
    async (span) => {
      const runSearch = async (
        interpreted: InterpretedSearchQuery,
        mustMatch: "all" | "any",
      ) => {
        const input: ProductSearchBuildInput = {
          ...searchInput,
          interpreted,
          options: {
            ...searchInput.options,
            mustMatch,
          },
        };
        // The commercetools client takes no signal: the step still times out and the parent
        // signal still stops the pipeline.
        const searchResult = await withTimeout(
          () => ct.searchProducts(input, { currency, country, locale: locales.catalogLocale }),
          timeouts.commercetoolsMs,
          "ct_search",
          signal,
        );
        timer?.mark("ct_search");

        let products = searchResult.projections;
        if (!products) {
          products = await withTimeout(
            () =>
              ct.getProductProjections(
                productIdsFrom(searchResult),
                locales.catalogLocale,
                currency,
                country,
                searchResult.matchedSkus ? { matchedSkus: searchResult.matchedSkus } : undefined,
              ),
            timeouts.commercetoolsMs,
            "ct_projections",
            signal,
          );
          timer?.mark("ct_projections");
        }

        return { searchResult, products, applied: interpreted };
      };

      let relaxation: SearchRelaxationLevel = "none";
      let mustMatch: "all" | "any" = "all";
      let { searchResult, products, applied } = await runSearch(resolved, mustMatch);

      if (searchResult.total === 0) {
        const dropped = relaxInterpretedSearch(resolved, "drop_soft_filters");
        if (dropped) {
          relaxation = "drop_soft_filters";
          ({ searchResult, products, applied } = await runSearch(dropped, "all"));
        }
      }

      if (searchResult.total === 0) {
        const anyMatch = relaxInterpretedSearch(resolved, "primary_any_match");
        if (anyMatch) {
          relaxation = "primary_any_match";
          mustMatch = "any";
          ({ searchResult, products, applied } = await runSearch(anyMatch, mustMatch));
        }
      }

      const entry: InterpretedSearchCacheEntry = {
        products,
        total: searchResult.total,
        relaxation,
        ...(facetSchema
          ? {
              facets: await labelCategoryFacets(
                ctx,
                normalizeProductSearchFacets(
                  searchResult.facets,
                  facetSchema,
                  resolved.suggestedFacets,
                  applied.filters,
                  currency,
                ),
                locales.catalogLocale,
                signal,
              ),
            }
          : {}),
      };
      const result = buildResult(entry);

      span?.update({
        output: { total: result.meta.total, productCount: result.products.length },
      });
      interpretedResultCache?.set(`${interpretedCacheKey}|${offset}`, entry);
      return result;
    },
  );
}

function productIdsFrom(searchResult: { productIds: string[] }): string[] {
  return searchResult.productIds;
}
