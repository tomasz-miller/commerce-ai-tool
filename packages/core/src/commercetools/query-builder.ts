import type { ProductSearchRequest, SearchSorting } from "@commercetools/platform-sdk";
import type {
  InterpretedSearchFilters,
  InterpretedSearchQuery,
  ResolvedFacetSchema,
} from "../types/index.js";
import {
  buildProductSearchFacets,
  buildProjectionFacetParams,
  getFacetAttribute,
} from "./facets.js";

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
  facetSchema?: ResolvedFacetSchema;
}

type SearchExpression = Record<string, unknown>;

const TEXT_FIELD_BOOSTS = [
  { field: "name", boost: 3 },
  { field: "searchKeywords", boost: 2 },
  { field: "description", boost: 1 },
] as const;

const SYSTEM_FILTER_KEYS = new Set(["category", "priceMin", "priceMax"]);

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
  const filterQuery = buildFilterExpressions(filters, options?.currency, input.facetSchema);
  const storeQuery = buildStoreScopeExpression(options);

  const queryParts = [textQuery, filterQuery, storeQuery].filter(Boolean) as SearchExpression[];
  let query: ProductSearchRequest["query"];
  if (queryParts.length === 1) {
    query = queryParts[0] as ProductSearchRequest["query"];
  } else if (queryParts.length > 1) {
    query = { and: queryParts } as ProductSearchRequest["query"];
  }

  const sortEntry = buildPriceSort(interpreted.sort, options?.currency);

  const request = {
    limit,
    offset,
    ...(query ? { query } : {}),
    ...(sortEntry ? { sort: [sortEntry] } : {}),
  };
  if (input.facetSchema) {
    return {
      ...request,
      facets: buildProductSearchFacets(input.facetSchema, interpreted.suggestedFacets),
    } as ProductSearchRequest;
  }
  return request;
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

  const projectionFilters = buildProjectionFilterParams(filters, options, input.facetSchema);
  if (projectionFilters.length > 0) {
    queryArgs.filter = projectionFilters;
  }

  if (input.facetSchema) {
    const facetParams = buildProjectionFacetParams(input.facetSchema, interpreted.suggestedFacets);
    if (facetParams.length > 0) {
      queryArgs.facet = facetParams;
    }
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
  schema?: ResolvedFacetSchema,
): SearchExpression | undefined {
  const parts: SearchExpression[] = [];

  pushAttributeExact(parts, filters, "color", schema, {
    field: "variants.attributes.color.key",
    fieldType: "enum",
  });
  pushAttributeExact(parts, filters, "brand", schema, {
    field: "variants.attributes.brand",
    fieldType: "text",
  });

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

  const numberRanges = collectNumberRanges(filters, schema);
  for (const range of numberRanges) {
    parts.push({
      range: {
        field: range.field,
        fieldType: "number",
        ranges: [range.bounds],
      },
    });
  }

  for (const [key, value] of Object.entries(filters)) {
    if (!value || SYSTEM_FILTER_KEYS.has(key) || key === "color" || key === "brand") {
      continue;
    }
    if (key.endsWith("Min") || key.endsWith("Max")) {
      continue;
    }
    const attribute = getFacetAttribute(schema ?? emptySchema, key);
    if (!attribute) {
      continue;
    }
    parts.push({
      exact: {
        field: attribute.field,
        fieldType: attribute.fieldType,
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
  schema?: ResolvedFacetSchema,
): string[] {
  const expressions: string[] = [];

  if (options?.storeScopeEnabled && options.storeKey) {
    expressions.push(`stores.key:"${escapeFilterValue(options.storeKey)}"`);
  }

  pushProjectionAttributeExact(expressions, filters, "color", schema, "variants.attributes.color.key");
  pushProjectionAttributeExact(expressions, filters, "brand", schema, "variants.attributes.brand");

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

  const numberRanges = collectNumberRanges(filters, schema);
  for (const range of numberRanges) {
    const from = range.bounds.from ?? "*";
    const to = range.bounds.to ?? "*";
    expressions.push(`${range.field}:range (${from} to ${to})`);
  }

  for (const [key, value] of Object.entries(filters)) {
    if (!value || SYSTEM_FILTER_KEYS.has(key) || key === "color" || key === "brand") {
      continue;
    }
    if (key.endsWith("Min") || key.endsWith("Max")) {
      continue;
    }
    const attribute = getFacetAttribute(schema ?? emptySchema, key);
    if (attribute) {
      expressions.push(`${attribute.field}:"${escapeFilterValue(value)}"`);
    }
  }

  return expressions;
}

function pushAttributeExact(
  parts: SearchExpression[],
  filters: InterpretedSearchFilters,
  name: "color" | "brand",
  schema: ResolvedFacetSchema | undefined,
  legacy: { field: string; fieldType: string },
): void {
  const value = filters[name];
  if (!value) {
    return;
  }

  if (schema) {
    const attribute = getFacetAttribute(schema, name);
    if (!attribute) {
      return;
    }
    parts.push({
      exact: {
        field: attribute.field,
        fieldType: attribute.fieldType,
        value,
        caseInsensitive: true,
      },
    });
    return;
  }

  parts.push({
    exact: {
      field: legacy.field,
      fieldType: legacy.fieldType,
      value,
      caseInsensitive: true,
    },
  });
}

function pushProjectionAttributeExact(
  expressions: string[],
  filters: InterpretedSearchFilters,
  name: "color" | "brand",
  schema: ResolvedFacetSchema | undefined,
  legacyField: string,
): void {
  const value = filters[name];
  if (!value) {
    return;
  }

  if (schema) {
    const attribute = getFacetAttribute(schema, name);
    if (!attribute) {
      return;
    }
    expressions.push(`${attribute.field}:"${escapeFilterValue(value)}"`);
    return;
  }

  expressions.push(`${legacyField}:"${escapeFilterValue(value)}"`);
}

function collectNumberRanges(
  filters: InterpretedSearchFilters,
  schema?: ResolvedFacetSchema,
): Array<{ field: string; bounds: { from?: number; to?: number } }> {
  if (!schema) {
    return [];
  }

  const byName = new Map<string, { field: string; bounds: { from?: number; to?: number } }>();

  for (const [key, value] of Object.entries(filters)) {
    if (!value) {
      continue;
    }
    const rangeMatch = key.match(/^(.+)(Min|Max)$/);
    if (!rangeMatch) {
      continue;
    }
    const attributeName = rangeMatch[1]!;
    const attribute = getFacetAttribute(schema, attributeName);
    if (attribute?.attributeType !== "number") {
      continue;
    }
    const valueAsNumber = Number(value);
    if (!Number.isFinite(valueAsNumber)) {
      continue;
    }
    const existing = byName.get(attributeName) ?? { field: attribute.field, bounds: {} };
    if (rangeMatch[2] === "Min") {
      existing.bounds.from = valueAsNumber;
    } else {
      existing.bounds.to = valueAsNumber;
    }
    byName.set(attributeName, existing);
  }

  return [...byName.values()];
}

const emptySchema: ResolvedFacetSchema = {
  attributes: [],
  systemFacets: [],
  etag: "",
  resolvedAt: "",
};

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
