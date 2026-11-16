import { withPipelineSpan } from "../observability/index.js";
import { logSearchTrace } from "../utils/dev-trace.js";
import type { createSearchTimer } from "../utils/search-timer.js";
import { withTimeout } from "../utils/with-timeout.js";
import type {
  DecomposedShoppingMission,
  FacetAttributeDefinition,
  MissionIntentGroup,
  ProductCard,
  SearchLocaleContext,
  SearchResult,
} from "../types/index.js";
import type { PipelineContext } from "./context.js";
import { isUsableMission } from "./mission.js";
import type { resolveMissionOptions } from "./mission.js";
import { executeSearch } from "./product-search.js";

export interface MissionSearchOptions {
  locales: SearchLocaleContext;
  timer: ReturnType<typeof createSearchTimer>;
  maxIntents: number;
  perIntentLimit: number;
  signal?: AbortSignal;
}

export interface MissionFromQueryOptions {
  locales: SearchLocaleContext;
  timer: ReturnType<typeof createSearchTimer>;
  missionOptions: ReturnType<typeof resolveMissionOptions>;
  attributeCatalog?: FacetAttributeDefinition[];
  signal?: AbortSignal;
}

export async function executeMissionSearch(
  ctx: PipelineContext,
  mission: DecomposedShoppingMission,
  options: MissionSearchOptions,
): Promise<SearchResult | null> {
  const { locales, timer, maxIntents, perIntentLimit, signal } = options;
  const intents = mission.intents.slice(0, maxIntents);
  logSearchTrace("mission", {
    intentCount: intents.length,
    quantities: intents.map((intent) => intent.quantity),
    confidence: mission.confidence,
    catalogLocale: locales.catalogLocale,
  });

  return withPipelineSpan(
    "commercetools.mission-search",
    {
      input: {
        intentCount: intents.length,
        confidence: mission.confidence,
        catalogLocale: locales.catalogLocale,
      },
    },
    async (span) => {
      const groups: MissionIntentGroup[] = await Promise.all(
        intents.map(async (intent) => {
          try {
            const result = await executeSearch(
              ctx,
              {
                searchTerms: intent.searchTerms,
                ...(intent.primaryTerm ? { primaryTerm: intent.primaryTerm } : {}),
                filters: intent.filters,
                sort: intent.sort ?? "relevance",
                interpretation: intent.label,
              },
              { locales, limit: perIntentLimit, offset: 0, timer, signal },
            );
            return {
              intent,
              products: result.products,
              total: result.meta.total,
            };
          } catch (error) {
            logSearchTrace("mission_intent_failed", {
              intentId: intent.id,
              message: error instanceof Error ? error.message : "unknown error",
            });
            return {
              intent,
              products: [] as ProductCard[],
              total: 0,
              failed: true,
            };
          }
        }),
      );

      if (groups.every((group) => group.products.length === 0)) {
        span?.update({ metadata: { allIntentsEmpty: true } });
        return null;
      }

      const products = uniqueProducts(groups.flatMap((group) => group.products));
      const total = groups.reduce((sum, group) => sum + group.total, 0);
      const searchTerms = uniqueStrings(groups.flatMap((group) => group.intent.searchTerms));

      const result: SearchResult = {
        products,
        meta: {
          total,
          limit: perIntentLimit,
          offset: 0,
          locale: locales.catalogLocale,
          catalogLocale: locales.catalogLocale,
          queryLocale: locales.queryLocale,
          queryInterpretation: mission.interpretation,
          searchTerms,
        },
        mission: {
          intents: groups,
          interpretation: mission.interpretation,
        },
      };

      span?.update({
        output: {
          intentCount: groups.length,
          failedCount: groups.filter((group) => group.failed).length,
          productCount: products.length,
          total,
        },
      });
      return result;
    },
  );
}

async function tryMissionSearchFromQuery(
  ctx: PipelineContext,
  query: string,
  options: MissionFromQueryOptions,
): Promise<SearchResult | null> {
  const { ai, timeouts } = ctx;
  const { locales, timer, missionOptions, attributeCatalog = [], signal } = options;
  if (!missionOptions.enabled) {
    return null;
  }
  const trimmed = query.trim();
  if (!trimmed) {
    return null;
  }
  const missionResult = await withTimeout(
    (stepSignal) =>
      ai.decomposeShoppingMission(trimmed, locales, attributeCatalog, { signal: stepSignal }),
    timeouts.aiTextMs,
    "ai_mission",
    signal,
  ).catch(() => null);
  if (missionResult) {
    timer.mark("ai_mission");
  }
  if (!isUsableMission(missionResult, missionOptions.minConfidence)) {
    return null;
  }
  return executeMissionSearch(ctx, missionResult, {
    locales,
    timer,
    maxIntents: missionOptions.maxIntents,
    perIntentLimit: missionOptions.perIntentLimit,
    signal,
  });
}

/**
 * Voice and image: runs the mission call and the standard product search side by side and
 * waits for both to settle. A usable mission wins; otherwise the product search result is used,
 * and its error is thrown only when there is no mission to fall back on. Both branches share the
 * request signal, so a host abort or step timeout still stops them.
 */
export async function searchWithOptionalMission(
  ctx: PipelineContext,
  missionQuery: string | undefined,
  runSearch: () => Promise<SearchResult>,
  options: MissionFromQueryOptions,
): Promise<SearchResult> {
  const { signal } = options;
  if (!missionQuery) {
    return runSearch();
  }
  const [mission, search] = await Promise.allSettled([
    tryMissionSearchFromQuery(ctx, missionQuery, options),
    runSearch(),
  ]);
  signal?.throwIfAborted();
  if (mission.status === "fulfilled" && mission.value) {
    return mission.value;
  }
  if (search.status === "fulfilled") {
    return search.value;
  }
  throw search.reason;
}

function uniqueProducts(products: ProductCard[]): ProductCard[] {
  const seen = new Set<string>();
  const result: ProductCard[] = [];
  for (const product of products) {
    if (seen.has(product.id)) {
      continue;
    }
    seen.add(product.id);
    result.push(product);
  }
  return result;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(value);
  }
  return result;
}
