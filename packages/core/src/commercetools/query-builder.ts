import type { ProductSearchRequest, SearchSorting } from "@commercetools/platform-sdk";
import type { InterpretedSearchQuery, InterpretedSearchFilters } from "../types/index.js";

export interface ProductSearchQueryOptions {
  currency?: string;
  /** When true, adds a fuzzy match on product name (tolerates typos). Default: true. */
  enableFuzzyName?: boolean;
  /**
   * Store key for future store-scoped search.
   * Not applied unless `storeScopeEnabled` is true (planned feature).
   */
  storeKey?: string;
  /** When false (default), `storeKey` is ignored. */
  storeScopeEnabled?: boolean;
}

export interface ProductSearchBuildInput {
  interpreted: InterpretedSearchQuery;
  catalogLocale: string;
  limit?: number;
  offset?: number;
  options?: ProductSearchQueryOptions;
}

type SearchExpression = Record<string, unknown>;

const TEXT_FIELD_BOOSTS = [
  { field: "name", boost: 3 },
  { field: "searchKeywords", boost: 2 },
  { field: "description", boost: 1 },
] as const;

const KNOWN_FILTER_KEYS = new Set(["color", "brand", "category", "priceMin", "priceMax"]);

export function hasSearchableContent(interpreted: InterpretedSearchQuery): boolean {
  const phrase = joinSearchTerms(interpreted.searchTerms);
  const filters = normalizeFilters(interpreted.filters);
  return phrase.length > 0 || Object.keys(filters).length > 0;
}

export function joinSearchTerms(searchTerms: string[]): string {
  return searchTerms.map((term) => term.trim()).filter(Boolean).join(" ");
}

export function buildProductSearchBody(
  interpreted: InterpretedSearchQuery,
  catalogLocale: string,
  limit = 20,
  offset = 0,
  options?: ProductSearchQueryOptions,
): ProductSearchRequest {
  return buildProductSearchRequest({
    interpreted,
    catalogLocale,
    limit,
    offset,
    options,
  });
}

export function buildProductSearchRequest(input: ProductSearchBuildInput): ProductSearchRequest {
  const { interpreted, catalogLocale, limit = 20, offset = 0, options } = input;
  const phrase = joinSearchTerms(interpreted.searchTerms);
  const filters = normalizeFilters(interpreted.filters);
  const enableFuzzy = options?.enableFuzzyName !== false;

  const textQuery = buildTextQuery(phrase, catalogLocale, enableFuzzy);
  const filterQuery = buildFilterExpressions(filters, options?.currency);
  const storeQuery = buildStoreScopeExpression(options);

  const queryParts = [textQuery, filterQuery, storeQuery].filter(Boolean) as SearchExpression[];
  let query: ProductSearchRequest["query"];
  if (queryParts.length === 1) {
    query = queryParts[0] as ProductSearchRequest["query"];
  } else if (queryParts.length > 1) {
    query = { and: queryParts } as ProductSearchRequest["query"];
  }

  const sortEntry = buildPriceSort(interpreted.sort, options?.currency);

  return {
    limit,
    offset,
    ...(query ? { query } : {}),
    ...(sortEntry ? { sort: [sortEntry] } : {}),
  };
}

export function buildProjectionSearchQueryArgs(
  input: ProductSearchBuildInput,
): Record<string, string | number | boolean | string[]> {
  const { interpreted, catalogLocale, limit = 20, offset = 0, options } = input;
  const phrase = joinSearchTerms(interpreted.searchTerms);
  const filters = normalizeFilters(interpreted.filters);
  const textKey = `text.${catalogLocale}`;

  const queryArgs: Record<string, string | number | boolean | string[]> = {
    limit,
    offset,
    localeProjection: catalogLocale,
    fuzzy: true,
  };

  if (phrase) {
    queryArgs[textKey] = phrase;
  }

  if (options?.currency) {
    queryArgs.priceCurrency = options.currency;
  }

  const projectionFilters = buildProjectionFilterParams(filters, options);
  if (projectionFilters.length > 0) {
    queryArgs.filter = projectionFilters;
  }

  const sort = interpreted.sort;
  if (sort === "price_asc") {
    queryArgs.sort = "price asc";
  } else if (sort === "price_desc") {
    queryArgs.sort = "price desc";
  }

  return queryArgs;
}

function buildTextQuery(
  phrase: string,
  catalogLocale: string,
  enableFuzzy: boolean,
): SearchExpression | undefined {
  if (!phrase) {
    return undefined;
  }

  const fieldMatches: SearchExpression[] = TEXT_FIELD_BOOSTS.map(({ field, boost }) => ({
    fullText: {
      field,
      language: catalogLocale,
      value: phrase,
      mustMatch: "all",
      boost,
    },
  }));

  if (enableFuzzy) {
    fieldMatches.push({
      fuzzy: {
        field: "name",
        language: catalogLocale,
        value: phrase,
        level: 1,
        mustMatch: "all",
      },
    });
  }

  return fieldMatches.length === 1 ? fieldMatches[0] : { or: fieldMatches };
}

function normalizeFilters(filters?: InterpretedSearchFilters): InterpretedSearchFilters {
  if (!filters) {
    return {};
  }

  const normalized: InterpretedSearchFilters = {};
  for (const [key, value] of Object.entries(filters)) {
    const trimmed = String(value).trim();
    if (trimmed) {
      normalized[key] = trimmed;
    }
  }
  return normalized;
}

function buildFilterExpressions(
  filters: InterpretedSearchFilters,
  currency?: string,
): SearchExpression | undefined {
  const parts: SearchExpression[] = [];

  if (filters.color) {
    parts.push({
      exact: {
        field: "variants.attributes.color.key",
        fieldType: "enum",
        value: filters.color,
        caseInsensitive: true,
      },
    });
  }

  if (filters.brand) {
    parts.push({
      exact: {
        field: "variants.attributes.brand",
        fieldType: "text",
        value: filters.brand,
        caseInsensitive: true,
      },
    });
  }

  if (filters.category) {
    parts.push({
      exact: {
        field: "categories",
        value: filters.category,
        caseInsensitive: true,
      },
    });
  }

  const priceMin = parsePriceToCentAmount(filters.priceMin);
  const priceMax = parsePriceToCentAmount(filters.priceMax);
  if (priceMin !== undefined || priceMax !== undefined) {
    const range: { from?: number; to?: number } = {};
    if (priceMin !== undefined) {
      range.from = priceMin;
    }
    if (priceMax !== undefined) {
      range.to = priceMax;
    }
    parts.push({
      range: {
        field: "variants.prices.centAmount",
        ranges: [range],
      },
    });
  }

  if (currency && (priceMin !== undefined || priceMax !== undefined)) {
    parts.push({
      exact: {
        field: "variants.prices.currencyCode",
        value: currency,
      },
    });
  }

  for (const [key, value] of Object.entries(filters)) {
    if (KNOWN_FILTER_KEYS.has(key)) {
      continue;
    }
    parts.push({
      exact: {
        field: `variants.attributes.${key}`,
        fieldType: "text",
        value,
        caseInsensitive: true,
      },
    });
  }

  if (parts.length === 0) {
    return undefined;
  }

  return parts.length === 1 ? parts[0] : { and: parts };
}

function buildStoreScopeExpression(options?: ProductSearchQueryOptions): SearchExpression | undefined {
  if (!options?.storeScopeEnabled || !options.storeKey) {
    return undefined;
  }

  return {
    exact: {
      field: "stores",
      value: options.storeKey,
      caseInsensitive: true,
    },
  };
}

function buildProjectionFilterParams(
  filters: InterpretedSearchFilters,
  options?: ProductSearchQueryOptions,
): string[] {
  const expressions: string[] = [];

  if (options?.storeScopeEnabled && options.storeKey) {
    expressions.push(`stores.key:"${escapeFilterValue(options.storeKey)}"`);
  }

  if (filters.color) {
    expressions.push(
      `variants.attributes.color.key:"${escapeFilterValue(filters.color)}"`,
    );
  }

  if (filters.brand) {
    expressions.push(`variants.attributes.brand:"${escapeFilterValue(filters.brand)}"`);
  }

  if (filters.category) {
    expressions.push(`categories.id:"${escapeFilterValue(filters.category)}"`);
  }

  const priceMin = parsePriceToCentAmount(filters.priceMin);
  const priceMax = parsePriceToCentAmount(filters.priceMax);
  if (priceMin !== undefined || priceMax !== undefined) {
    const from = priceMin ?? "*";
    const to = priceMax ?? "*";
    expressions.push(`variants.prices.centAmount:range (${from} to ${to})`);
  }

  if (options?.currency && (priceMin !== undefined || priceMax !== undefined)) {
    expressions.push(`variants.prices.currencyCode:"${escapeFilterValue(options.currency)}"`);
  }

  for (const [key, value] of Object.entries(filters)) {
    if (KNOWN_FILTER_KEYS.has(key) || !value) {
      continue;
    }
    expressions.push(`variants.attributes.${key}:"${escapeFilterValue(value)}"`);
  }

  return expressions;
}

function buildPriceSort(
  sort: InterpretedSearchQuery["sort"],
  currency?: string,
): SearchSorting | undefined {
  if (sort !== "price_asc" && sort !== "price_desc") {
    return undefined;
  }

  const order = sort === "price_asc" ? "asc" : "desc";

  if (currency) {
    return {
      field: "variants.prices.centAmount",
      order,
      filter: {
        exact: {
          field: "variants.prices.currencyCode",
          value: currency,
        },
      },
    };
  }

  return {
    field: "variants.prices.centAmount",
    order,
  };
}

function parsePriceToCentAmount(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }

  return Math.round(parsed * 100);
}

function escapeFilterValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
