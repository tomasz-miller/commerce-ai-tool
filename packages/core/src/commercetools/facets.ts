import type {
  FacetAttributeDefinition,
  InterpretedSearchFilters,
  ResolvedFacetSchema,
  SearchFacetGroup,
  SuggestedFacet,
} from "../types/index.js";

export const PRICE_FACET_ID = "price";
export const CATEGORIES_FACET_ID = "categories";

export const DEFAULT_PRICE_RANGES = [
  { key: "under-50", to: 5_000 },
  { key: "50-to-100", from: 5_000, to: 10_000 },
  { key: "100-plus", from: 10_000 },
] as const;

export type PriceRangeDefinition = (typeof DEFAULT_PRICE_RANGES)[number];

/** Major currency units (e.g. EUR) corresponding to a price range bucket. */
export function priceRangeToFilterValues(
  range: PriceRangeDefinition,
): Pick<InterpretedSearchFilters, "priceMin" | "priceMax"> {
  const filters: Pick<InterpretedSearchFilters, "priceMin" | "priceMax"> = {};
  if ("from" in range && range.from !== undefined) {
    filters.priceMin = String(range.from / 100);
  }
  if ("to" in range && range.to !== undefined) {
    filters.priceMax = String(range.to / 100);
  }
  return filters;
}

export function priceBucketKeyFromFilters(
  filters: InterpretedSearchFilters,
): string | undefined {
  const minCents = parseMajorToCents(filters.priceMin);
  const maxCents = parseMajorToCents(filters.priceMax);

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
): boolean {
  if (facetId === CATEGORIES_FACET_ID) {
    return filters.category === bucketKey;
  }
  if (facetId === PRICE_FACET_ID) {
    return priceBucketKeyFromFilters(filters) === bucketKey;
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
): InterpretedSearchFilters {
  const next = { ...filters };

  if (facetId === PRICE_FACET_ID) {
    if (priceBucketKeyFromFilters(next) === bucketKey) {
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
    return { ...next, ...priceRangeToFilterValues(range) };
  }

  const filterKey = facetId === CATEGORIES_FACET_ID ? "category" : facetId;
  if (next[filterKey] === bucketKey) {
    delete next[filterKey];
  } else {
    next[filterKey] = bucketKey;
  }
  return next;
}

export function buildProductSearchFacets(
  schema: ResolvedFacetSchema,
  suggestedFacets: SuggestedFacet[] = [],
): unknown[] {
  const names = requestedFacetNames(schema, suggestedFacets);
  const facets: unknown[] = [];
  for (const name of names) {
    if (name === CATEGORIES_FACET_ID) {
      facets.push({ distinct: { name, field: "categories", limit: 12, level: "products" } });
      continue;
    }
    if (name === PRICE_FACET_ID) {
      facets.push({
        ranges: {
          name,
          field: "variants.prices.centAmount",
          ranges: DEFAULT_PRICE_RANGES.map((range) => ({ ...range })),
          level: "products",
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
      },
    });
  }
  return facets;
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
      ...(selectedFacetValue(record.name, filters)
        ? { selectedKey: selectedFacetValue(record.name, filters) }
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
    return record.buckets.flatMap((bucket) => normalizeBucket(bucket));
  }

  if (Array.isArray(record.terms)) {
    return record.terms.flatMap((term) => normalizeTermBucket(term));
  }

  if (Array.isArray(record.ranges)) {
    return record.ranges.flatMap((range, index) => normalizeRangeBucket(range, index));
  }

  return [];
}

function normalizeBucket(bucket: unknown) {
  if (!bucket || typeof bucket !== "object") {
    return [];
  }
  const record = bucket as { key?: unknown; count?: unknown };
  if (typeof record.key !== "string" || typeof record.count !== "number") {
    return [];
  }
  return [{ key: record.key, label: record.key, count: record.count }];
}

function normalizeTermBucket(bucket: unknown) {
  if (!bucket || typeof bucket !== "object") {
    return [];
  }
  const record = bucket as { term?: unknown; count?: unknown };
  if (typeof record.term !== "string" || typeof record.count !== "number") {
    return [];
  }
  return [{ key: record.term, label: record.term, count: record.count }];
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

function selectedFacetValue(name: string, filters: InterpretedSearchFilters): string | undefined {
  if (name === CATEGORIES_FACET_ID) {
    return filters.category;
  }
  if (name === PRICE_FACET_ID) {
    return priceBucketKeyFromFilters(filters);
  }
  return filters[name];
}

function parseMajorToCents(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }
  return Math.round(parsed * 100);
}
