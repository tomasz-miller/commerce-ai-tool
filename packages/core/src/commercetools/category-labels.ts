import { SearchCache } from "../cache/search-cache.js";
import { logSearchTrace } from "../utils/dev-trace.js";

/**
 * Batched category name lookup for the categories facet. `acceptLanguage` applies the locale
 * fallback chain server-side, like the card hydrate query.
 */
export const CATEGORY_NAMES_GRAPHQL_QUERY = `
query CategoryNames($where: String!, $limit: Int!, $locales: [Locale!]!) {
  categories(where: $where, limit: $limit) {
    results {
      id
      name(acceptLanguage: $locales)
    }
  }
}
`.trim();

/** Category ids from facet buckets are UUIDs; anything else never reaches the predicate. */
const CATEGORY_ID_PATTERN = /^[A-Za-z0-9_-]{1,256}$/;

export function buildCategoryIdsWhere(ids: string[]): string {
  return `id in (${ids.map((id) => `"${id}"`).join(",")})`;
}

/**
 * Reads a GraphQL `categories` response. A response with `errors` and no usable data (for
 * example a missing `view_categories` scope) is a failure, not an empty result.
 */
export function parseCategoryNamesResponse(body: {
  data?: { categories?: { results?: Array<{ id: string; name?: string | null } | null> | null } | null } | null;
  errors?: Array<{ message: string }> | null;
}): Record<string, string> {
  const results = body.data?.categories?.results;
  if (!Array.isArray(results)) {
    const messages = (body.errors ?? []).map((error) => error.message).filter(Boolean);
    if (messages.length > 0) {
      throw new Error(`GraphQL categories query failed: ${messages.join("; ")}`);
    }
    return {};
  }
  const names: Record<string, string> = {};
  for (const category of results) {
    if (category?.id && category.name) {
      names[category.id] = category.name;
    }
  }
  return names;
}

/** Fetches localized names for category ids. Ids without a name are left out of the result. */
export type CategoryNamesFetcher = (ids: string[], locale: string) => Promise<Record<string, string>>;

export interface CategoryLabelCacheOptions {
  /** Default: 10 minutes. Category names change rarely. */
  ttlMs?: number;
  /** Default: 2000 entries (one per locale and category id). */
  maxEntries?: number;
  /**
   * How long an id stays unresolved after a failed lookup or a lookup that returned no name, so
   * a broken or unauthorized lookup is not repeated on every search. Default: 60 seconds.
   */
  negativeTtlMs?: number;
}

/** A failing lookup warns once per process; repeats go to the CAT_DEBUG trace only. */
let failureWarned = false;

export function _resetCategoryLabelWarningForTests(): void {
  failureWarned = false;
}

/**
 * Bounded, TTL-limited cache of category names keyed by locale and id. Missing ids are fetched
 * in one batch. A failed lookup is logged and the ids are left unresolved, so the facet falls
 * back to showing the id.
 */
export class CategoryLabelCache {
  private readonly cache: SearchCache<string>;
  private readonly misses: SearchCache<true>;

  constructor(
    private readonly fetchNames: CategoryNamesFetcher,
    options: CategoryLabelCacheOptions = {},
  ) {
    this.cache = new SearchCache<string>({
      ttlMs: options.ttlMs ?? 10 * 60_000,
      maxEntries: options.maxEntries ?? 2_000,
    });
    this.misses = new SearchCache<true>({
      ttlMs: options.negativeTtlMs ?? 60_000,
      maxEntries: options.maxEntries ?? 2_000,
    });
  }

  async resolve(ids: string[], locale: string): Promise<Record<string, string>> {
    const names: Record<string, string> = {};
    const missing: string[] = [];
    for (const id of new Set(ids)) {
      if (!CATEGORY_ID_PATTERN.test(id)) {
        continue;
      }
      const key = cacheKey(locale, id);
      const cached = this.cache.get(key);
      if (cached !== undefined) {
        names[id] = cached;
      } else if (!this.misses.get(key)) {
        missing.push(id);
      }
    }

    if (missing.length === 0) {
      return names;
    }

    try {
      const fetched = await this.fetchNames(missing, locale);
      for (const id of missing) {
        const name = fetched[id]?.trim();
        if (name) {
          this.cache.set(cacheKey(locale, id), name);
          names[id] = name;
        } else {
          this.misses.set(cacheKey(locale, id), true);
        }
      }
    } catch (error) {
      for (const id of missing) {
        this.misses.set(cacheKey(locale, id), true);
      }
      const message = error instanceof Error ? error.message : "unknown error";
      if (failureWarned) {
        logSearchTrace("category_names_failed", { message, ids: missing.length });
      } else {
        failureWarned = true;
        console.warn(
          `[commerce-ai-tool/core] Category name lookup failed; showing category ids (further failures are logged with CAT_DEBUG only): ${message}`,
        );
      }
    }
    return names;
  }
}

function cacheKey(locale: string, id: string): string {
  return `${locale}|${id}`;
}
