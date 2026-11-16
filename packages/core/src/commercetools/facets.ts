import type {
  FacetAttributeDefinition,
  InterpretedSearchFilters,
  ResolvedFacetSchema,
  SearchFacetGroup,
  SuggestedFacet,
} from "../types/index.js";
import { currencyFractionDigits } from "./currency.js";
import { formatFacetBucketLabel } from "./facet-color.js";

export const PRICE_FACET_ID = "price";
export const CATEGORIES_FACET_ID = "categories";

/**
 * Price bucket bounds in minor units of the request currency (`variants.prices.currentCentAmount`).
 * The bounds are the same amounts for every currency; `currency` only changes how a bound maps
 * to the major-unit `priceMin` / `priceMax` filter values (5000 is 50 EUR, 5 KWD, 5000 JPY).
 */
export const DEFAULT_PRICE_RANGES = [
  { key: "under-50", to: 5_000 },
  { key: "50-to-100", from: 5_000, to: 10_000 },
  { key: "100-plus", from: 10_000 },
] as const;

export type PriceRangeDefinition = (typeof DEFAULT_PRICE_RANGES)[number];

/**
 * Major currency units corresponding to a price range bucket. `currency` (ISO 4217) sets the
 * fraction digits; omitted, 2 digits are assumed.
 */
export function priceRangeToFilterValues(
  range: PriceRangeDefinition,
  currency?: string,
): Pick<InterpretedSearchFilters, "priceMin" | "priceMax"> {
  const divisor = 10 ** currencyFractionDigits(currency);
  const filters: Pick<InterpretedSearchFilters, "priceMin" | "priceMax"> = {};
  if ("from" in range && range.from !== undefined) {
    filters.priceMin = String(range.from / divisor);
  }
  if ("to" in range && range.to !== undefined) {
    filters.priceMax = String(range.to / divisor);
  }
  return filters;
}

export function priceBucketKeyFromFilters(
  filters: InterpretedSearchFilters,
  currency?: string,
): string | undefined {
  const minCents = parseMajorToCents(filters.priceMin, currency);
  const maxCents = parseMajorToCents(filters.priceMax, currency);

  for (const range of DEFAULT_PRICE_RANGES) {
    const from = "from" in range ? range.from : undefined;
    const to = "to" in range ? range.to : undefined;
    if (minCents === from && maxCents === to) {
      return range.key;
    }
  }
  return undefined;
}

export function isFacetFilterSelected(
  filters: InterpretedSearchFilters,
  facetId: string,
  bucketKey: string,
  currency?: string,
): boolean {
  if (facetId === CATEGORIES_FACET_ID) {
    return filters.category === bucketKey;
  }
  if (facetId === PRICE_FACET_ID) {
    return priceBucketKeyFromFilters(filters, currency) === bucketKey;
  }
  return filters[facetId] === bucketKey;
}

/**
 * Toggle a facet chip into filter state. Price buckets map to priceMin/priceMax;
 * categories map to `category`.
 */
export function toggleFacetFilter(
  filters: InterpretedSearchFilters,
  facetId: string,
  bucketKey: string,
  currency?: string,
): InterpretedSearchFilters {
  const next = { ...filters };

  if (facetId === PRICE_FACET_ID) {
    if (priceBucketKeyFromFilters(next, currency) === bucketKey) {
      delete next.priceMin;
      delete next.priceMax;
      return next;
    }
    delete next.priceMin;
    delete next.priceMax;
    const range = DEFAULT_PRICE_RANGES.find((candidate) => candidate.key === bucketKey);
    if (!range) {
      return next;
    }
    return { ...next, ...priceRangeToFilterValues(range, currency) };
  }

  const filterKey = facetId === CATEGORIES_FACET_ID ? "category" : facetId;
  if (next[filterKey] === bucketKey) {
    delete next[filterKey];
  } else {
    next[filterKey] = bucketKey;
  }
  return next;
}

/**
 * Attribute behind a `<attr>Min` / `<attr>Max` range-bound filter key, or undefined when `key` is
 * not one. Only number attributes of `schema` have range bounds: a text or enum attribute that
 * merely ends in `Min` or `Max` (`temperatureMax`) is a plain attribute, and without a schema no
 * key is a range bound.
 */
export function rangeBoundAttribute(key: string, schema?: ResolvedFacetSchema): string | undefined {
  const range = key.match(/^(.+)(Min|Max)$/);
  const name = range?.[1];
  if (!name || !schema) {
    return undefined;
  }
  return getFacetAttribute(schema, name)?.attributeType === "number" ? name : undefined;
}

/**
 * Facet group a filter key belongs to: `priceMin`/`priceMax` -> `price`, `category` ->
 * `categories`, `<attr>Min`/`<attr>Max` -> `<attr>` for a number attribute of `schema`, any other
 * key -> itself.
 */
export function facetGroupForFilterKey(key: string, schema?: ResolvedFacetSchema): string {
  if (key === "priceMin" || key === "priceMax") {
    return PRICE_FACET_ID;
  }
  if (key === "category") {
    return CATEGORIES_FACET_ID;
  }
  return rangeBoundAttribute(key, schema) ?? key;
}

export interface ProductSearchFacetOptions {
  /** Request currency. Scopes the price ranges facet to prices in this currency. */
  currency?: string;
  /**
   * Facet `filter` per facet name: the facet-chip selections of the other groups, so each group
   * counts within the other selections but not its own (multi-select faceted navigation).
   */
  facetFilters?: Record<string, unknown>;
}

export function buildProductSearchFacets(
  schema: ResolvedFacetSchema,
  suggestedFacets: SuggestedFacet[] = [],
  options: ProductSearchFacetOptions = {},
): unknown[] {
  const names = requestedFacetNames(schema, suggestedFacets);
  const facets: unknown[] = [];
  const filterFor = (name: string) => {
    const filter = options.facetFilters?.[name];
    return filter ? { filter } : {};
  };
  for (const name of names) {
    if (name === CATEGORIES_FACET_ID) {
      facets.push({
        distinct: { name, field: "categories", limit: 12, level: "products", ...filterFor(name) },
      });
      continue;
    }
    if (name === PRICE_FACET_ID) {
      facets.push({
        ranges: {
          name,
          field: "variants.prices.currentCentAmount",
          ranges: DEFAULT_PRICE_RANGES.map((range) => ({ ...range })),
          level: "products",
          ...priceFacetFilter(options.currency, options.facetFilters?.[name]),
        },
      });
      continue;
    }

    const attribute = schema.attributes.find((candidate) => candidate.name === name);
    if (!attribute || attribute.kind !== "distinct") {
      continue;
    }
    facets.push({
      distinct: {
        name: attribute.name,
        field: attribute.field,
        fieldType: attribute.fieldType,
        limit: 12,
        level: "products",
        ...filterFor(name),
      },
    });
  }
  return facets;
}

/** Counts only prices in the request currency, combined with any other-group chip filter. */
function priceFacetFilter(currency: string | undefined, chipFilter: unknown): { filter?: unknown } {
  const currencyFilter = currency
    ? { exact: { field: "variants.prices.currencyCode", value: currency } }
    : undefined;
  if (currencyFilter && chipFilter) {
    return { filter: { and: [currencyFilter, chipFilter] } };
  }
  const filter = currencyFilter ?? chipFilter;
  return filter ? { filter } : {};
}

/**
 * Replaces category bucket labels (category ids) with localized names. Buckets without a
 * resolved name keep the id as their label. The bucket `key` stays the id, which is what the
 * `category` filter and Product Search `categories` field match.
 */
export function applyCategoryLabels(
  facets: SearchFacetGroup[],
  names: Record<string, string>,
): SearchFacetGroup[] {
  return facets.map((facet) =>
    facet.id === CATEGORIES_FACET_ID
      ? {
          ...facet,
          buckets: facet.buckets.map((bucket) => ({
            ...bucket,
            label: names[bucket.key] ?? bucket.label,
          })),
        }
      : facet,
  );
}

/** Category ids in the categories facet group, for a label lookup. */
export function categoryBucketIds(facets: SearchFacetGroup[]): string[] {
  return facets
    .filter((facet) => facet.id === CATEGORIES_FACET_ID)
    .flatMap((facet) => facet.buckets.map((bucket) => bucket.key));
}

/** Product Projection Search `facet` query parameter expressions. */
export function buildProjectionFacetParams(
  schema: ResolvedFacetSchema,
  suggestedFacets: SuggestedFacet[] = [],
): string[] {
  const names = requestedFacetNames(schema, suggestedFacets);
  const facets: string[] = [];

  for (const name of names) {
    if (name === CATEGORIES_FACET_ID) {
      facets.push(`categories.id as ${CATEGORIES_FACET_ID}`);
      continue;
    }
    if (name === PRICE_FACET_ID) {
      const ranges = DEFAULT_PRICE_RANGES.map((range) => {
        const from = "from" in range && range.from !== undefined ? String(range.from) : "*";
        const to = "to" in range && range.to !== undefined ? String(range.to) : "*";
        return `(${from} to ${to})`;
      }).join(", ");
      facets.push(`variants.prices.centAmount:range ${ranges} as ${PRICE_FACET_ID}`);
      continue;
    }

    const attribute = schema.attributes.find((candidate) => candidate.name === name);
    if (!attribute || attribute.kind !== "distinct") {
      continue;
    }
    facets.push(`${attribute.field} as ${attribute.name}`);
  }

  return facets;
}

export function normalizeProductSearchFacets(
  rawFacets: unknown,
  schema: ResolvedFacetSchema,
  suggestedFacets: SuggestedFacet[] = [],
  filters: InterpretedSearchFilters = {},
  currency?: string,
): SearchFacetGroup[] {
  const raw = Array.isArray(rawFacets)
    ? rawFacets
    : rawFacets && typeof rawFacets === "object"
      ? Object.entries(rawFacets as Record<string, unknown>).map(([name, facet]) => ({
          name,
          ...(facet && typeof facet === "object" ? facet : {}),
        }))
      : [];
  const labels = new Map(schema.attributes.map((attribute) => [attribute.name, attribute.label]));

  const facets: SearchFacetGroup[] = [];
  for (const facet of raw) {
    if (!facet || typeof facet !== "object") {
      continue;
    }
    const record = facet as {
      name?: unknown;
      buckets?: unknown;
      terms?: unknown;
      ranges?: unknown;
    };
    if (typeof record.name !== "string") {
      continue;
    }

    const buckets = normalizeFacetBuckets({
      name: record.name,
      buckets: record.buckets,
      terms: record.terms,
      ranges: record.ranges,
    });
    if (!buckets.length) {
      continue;
    }

    facets.push({
      id: record.name,
      label:
        labels.get(record.name) ??
        (record.name === CATEGORIES_FACET_ID
          ? "Categories"
          : record.name === PRICE_FACET_ID
            ? "Price"
            : record.name),
      type: record.name === PRICE_FACET_ID ? "range" : "distinct",
      buckets,
      ...(record.name === PRICE_FACET_ID && currency ? { currency } : {}),
      ...(selectedFacetValue(record.name, filters, currency)
        ? { selectedKey: selectedFacetValue(record.name, filters, currency) }
        : {}),
    });
  }
  const requested = requestedFacetNames(schema, suggestedFacets);
  return facets.sort((left, right) => requested.indexOf(left.id) - requested.indexOf(right.id));
}

export function filterFacetSuggestions(
  suggestedFacets: SuggestedFacet[] | undefined,
  schema: ResolvedFacetSchema,
): SuggestedFacet[] {
  const known = new Set([...schema.attributes.map((attribute) => attribute.name), ...schema.systemFacets]);
  return (suggestedFacets ?? []).filter((facet) => known.has(facet.name)).slice(0, 5);
}

export function getFacetAttribute(
  schema: ResolvedFacetSchema,
  name: string,
): FacetAttributeDefinition | undefined {
  return schema.attributes.find((attribute) => attribute.name === name);
}

function requestedFacetNames(
  schema: ResolvedFacetSchema,
  suggestedFacets: SuggestedFacet[],
): string[] {
  const suggested = filterFacetSuggestions(suggestedFacets, schema).map((facet) => facet.name);
  return suggested.length ? suggested : schema.attributes.slice(0, 3).map((attribute) => attribute.name);
}

function normalizeFacetBuckets(record: {
  buckets?: unknown;
  terms?: unknown;
  ranges?: unknown;
  name?: string;
}): Array<{ key: string; label: string; count: number }> {
  if (Array.isArray(record.buckets)) {
    return record.buckets.flatMap((bucket) => normalizeBucket(bucket, record.name));
  }

  if (Array.isArray(record.terms)) {
    return record.terms.flatMap((term) => normalizeTermBucket(term, record.name));
  }

  if (Array.isArray(record.ranges)) {
    return record.ranges.flatMap((range, index) => normalizeRangeBucket(range, index));
  }

  return [];
}

function normalizeBucket(bucket: unknown, facetName?: string) {
  if (!bucket || typeof bucket !== "object") {
    return [];
  }
  const record = bucket as { key?: unknown; count?: unknown };
  if (typeof record.key !== "string" || typeof record.count !== "number") {
    return [];
  }
  return [{ key: record.key, label: formatFacetBucketLabel(record.key, facetName), count: record.count }];
}

function normalizeTermBucket(bucket: unknown, facetName?: string) {
  if (!bucket || typeof bucket !== "object") {
    return [];
  }
  const record = bucket as { term?: unknown; count?: unknown };
  if (typeof record.term !== "string" || typeof record.count !== "number") {
    return [];
  }
  return [{ key: record.term, label: formatFacetBucketLabel(record.term, facetName), count: record.count }];
}

function normalizeRangeBucket(bucket: unknown, index: number) {
  if (!bucket || typeof bucket !== "object") {
    return [];
  }
  const record = bucket as { from?: unknown; to?: unknown; count?: unknown; key?: unknown };
  if (typeof record.count !== "number") {
    return [];
  }

  if (typeof record.key === "string") {
    return [{ key: record.key, label: record.key, count: record.count }];
  }

  const from = typeof record.from === "number" ? record.from : undefined;
  const to = typeof record.to === "number" ? record.to : undefined;
  const matched = DEFAULT_PRICE_RANGES.find((range) => {
    const rangeFrom = "from" in range ? range.from : undefined;
    const rangeTo = "to" in range ? range.to : undefined;
    return rangeFrom === from && rangeTo === to;
  });
  const key = matched?.key ?? `${from ?? "*"}-${to ?? "*"}-${index}`;
  return [{ key, label: key, count: record.count }];
}

function selectedFacetValue(
  name: string,
  filters: InterpretedSearchFilters,
  currency?: string,
): string | undefined {
  if (name === CATEGORIES_FACET_ID) {
    return filters.category;
  }
  if (name === PRICE_FACET_ID) {
    return priceBucketKeyFromFilters(filters, currency);
  }
  return filters[name];
}

function parseMajorToCents(value?: string, currency?: string): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }
  return Math.round(parsed * 10 ** currencyFractionDigits(currency));
}
