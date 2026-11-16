import type { ProductCard } from "../types/index.js";
import { formatCurrency } from "./cart.js";

/** Max product IDs per GraphQL `products` query (commercetools pagination). */
export const GRAPHQL_PRODUCT_CARD_CHUNK_SIZE = 100;

/**
 * Card hydrate query — pass only `acceptLanguage` on localized strings
 * (commercetools rejects `locale` and `acceptLanguage` together).
 * Do not use `localeProjection` with `name(acceptLanguage:)`.
 *
 * `acceptLanguage` already applies the locale fallback chain, so `description` needs no
 * all-locale copy. `nameAllLocales` / `slugAllLocales` stay as a last resort for a product
 * with no value in any locale of the chain.
 *
 * `matchedVariants` selects the variants Product Search marked as matching (by sku, which is
 * unique per project), so one list serves the whole chunk. It is skipped by `@include` when the
 * chunk has no partially matched product.
 */
export const PRODUCT_CARDS_GRAPHQL_QUERY = `
query ProductCards(
  $where: String!
  $limit: Int!
  $locales: [Locale!]!
  $currency: Currency!
  $country: Country
  $matchedSkus: [String!]
  $includeMatched: Boolean!
) {
  products(where: $where, limit: $limit) {
    results {
      id
      key
      masterData {
        current {
          name(acceptLanguage: $locales)
          description(acceptLanguage: $locales)
          slug(acceptLanguage: $locales)
          nameAllLocales { locale value }
          slugAllLocales { locale value }
          masterVariant {
            ...CardVariant
          }
          matchedVariants: allVariants(skus: $matchedSkus) @include(if: $includeMatched) {
            ...CardVariant
          }
        }
      }
    }
  }
}

fragment CardVariant on ProductVariant {
  id
  sku
  images { url }
  price(currency: $currency, country: $country) {
    value { centAmount currencyCode fractionDigits }
  }
}
`.trim();

export interface GraphQLMoneyValue {
  centAmount: number;
  currencyCode: string;
  fractionDigits?: number;
}

export interface GraphQLLocalizedStringEntry {
  locale: string;
  value?: string | null;
}

export interface GraphQLProductCardVariant {
  id?: number;
  sku?: string | null;
  images?: Array<{ url: string } | null> | null;
  price?: { value: GraphQLMoneyValue } | null;
}

export interface GraphQLProductCardCurrent {
  name?: string | null;
  description?: string | null;
  slug?: string | null;
  nameAllLocales?: Array<GraphQLLocalizedStringEntry | null> | null;
  slugAllLocales?: Array<GraphQLLocalizedStringEntry | null> | null;
  masterVariant?: GraphQLProductCardVariant | null;
  /** Variants selected by `allVariants(skus: $matchedSkus)`; absent when not requested. */
  matchedVariants?: Array<GraphQLProductCardVariant | null> | null;
}

export interface GraphQLProductCardResult {
  id: string;
  key?: string | null;
  masterData?: {
    current?: GraphQLProductCardCurrent | null;
  } | null;
}

export interface GraphQLProductCardsData {
  products?: {
    results?: Array<GraphQLProductCardResult | null> | null;
  } | null;
}

export interface ProductCardsGraphQLVariables {
  where: string;
  limit: number;
  locales: string[];
  currency: string;
  country?: string;
  /** Skus of the matched variants of the products in this chunk. */
  matchedSkus: string[];
  includeMatched: boolean;
}

/** Product id -> sku of the matched variant to show on its card (see `extractMatchedSkus`). */
export type MatchedSkus = Record<string, string>;

/**
 * Build a commercetools query predicate for product IDs.
 * IDs are UUID strings from Product Search — no escaping beyond quoting.
 */
export function buildProductIdsWhere(productIds: string[]): string {
  const quoted = productIds.map((id) => `"${id}"`).join(",");
  return `id in (${quoted})`;
}

export function chunkProductIds(
  productIds: string[],
  chunkSize = GRAPHQL_PRODUCT_CARD_CHUNK_SIZE,
): string[][] {
  if (productIds.length === 0) {
    return [];
  }
  const chunks: string[][] = [];
  for (let i = 0; i < productIds.length; i += chunkSize) {
    chunks.push(productIds.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Accept-Language style fallbacks for catalog locales (e.g. en-GB → en-US → en).
 */
export function buildAcceptLanguageLocales(locale: string): string[] {
  const primary = locale.trim();
  if (!primary) {
    return ["en"];
  }

  const ordered: string[] = [primary];
  const language = primary.split("-")[0]?.toLowerCase();

  if (language === "en") {
    for (const candidate of ["en-GB", "en-US", "en"]) {
      if (!ordered.includes(candidate)) {
        ordered.push(candidate);
      }
    }
  } else if (language) {
    if (!ordered.includes(language)) {
      ordered.push(language);
    }
    for (const candidate of ["en-GB", "en-US", "en"]) {
      if (!ordered.includes(candidate)) {
        ordered.push(candidate);
      }
    }
  }

  return ordered;
}

export function buildProductCardsGraphQLVariables(
  productIds: string[],
  locale: string,
  currency: string,
  country?: string,
  matchedSkus: MatchedSkus = {},
): ProductCardsGraphQLVariables {
  const skus = productIds.flatMap((id) => (matchedSkus[id] ? [matchedSkus[id]] : []));
  const variables: ProductCardsGraphQLVariables = {
    where: buildProductIdsWhere(productIds),
    limit: productIds.length,
    locales: buildAcceptLanguageLocales(locale),
    currency,
    matchedSkus: skus,
    includeMatched: skus.length > 0,
  };
  if (country) {
    variables.country = country;
  }
  return variables;
}

export function pickLocalizedValue(
  direct: string | null | undefined,
  allLocales: Array<GraphQLLocalizedStringEntry | null> | null | undefined,
  preferredLocales: string[],
): string | undefined {
  const trimmedDirect = direct?.trim();
  if (trimmedDirect) {
    return trimmedDirect;
  }

  const entries = (allLocales ?? []).filter(
    (entry): entry is GraphQLLocalizedStringEntry =>
      Boolean(entry?.locale && entry.value?.trim()),
  );
  if (entries.length === 0) {
    return undefined;
  }

  const byLocale = new Map(
    entries.map((entry) => [entry.locale, entry.value!.trim()] as const),
  );

  for (const locale of preferredLocales) {
    const value = byLocale.get(locale);
    if (value) {
      return value;
    }
  }

  return entries[0]?.value?.trim() || undefined;
}

export function mapGraphQLProductToCard(
  product: GraphQLProductCardResult,
  locale: string,
  matchedSku?: string,
): ProductCard | null {
  const current = product.masterData?.current;
  if (!current) {
    return null;
  }

  const preferredLocales = buildAcceptLanguageLocales(locale);
  const name =
    pickLocalizedValue(current.name, current.nameAllLocales, preferredLocales) ??
    "Unnamed product";
  const description = current.description?.trim() || undefined;
  const slug = pickLocalizedValue(current.slug, current.slugAllLocales, preferredLocales);

  // The matched variant when Product Search matched only some variants, else the master.
  const matchedVariant = matchedSku
    ? current.matchedVariants?.find((candidate) => candidate?.sku === matchedSku)
    : undefined;
  const variant = matchedVariant ?? current.masterVariant;
  const priceValue = variant?.price?.value;
  const fractionDigits = priceValue?.fractionDigits ?? 2;
  const amount = priceValue
    ? priceValue.centAmount / Math.pow(10, fractionDigits)
    : undefined;

  return {
    id: product.id,
    key: product.key ?? undefined,
    name,
    description,
    imageUrl: variant?.images?.[0]?.url,
    sku: variant?.sku ?? undefined,
    variantId: variant?.id,
    slug,
    price: priceValue
      ? {
          amount: amount ?? 0,
          currency: priceValue.currencyCode,
          formatted: formatCurrency(amount ?? 0, priceValue.currencyCode, locale),
        }
      : undefined,
  };
}

/**
 * Map GraphQL `products` results to ProductCards, preserving Product Search order.
 * Unpublished products (`current` missing) are skipped.
 */
export function mapGraphQLProductsToCards(
  results: Array<GraphQLProductCardResult | null | undefined> | null | undefined,
  productIds: string[],
  locale: string,
  matchedSkus: MatchedSkus = {},
): ProductCard[] {
  const orderMap = new Map(productIds.map((id, index) => [id, index]));
  const cards: ProductCard[] = [];

  for (const product of results ?? []) {
    if (!product) {
      continue;
    }
    const card = mapGraphQLProductToCard(product, locale, matchedSkus[product.id]);
    if (card) {
      cards.push(card);
    }
  }

  return cards.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
}

export function extractGraphQLProductResults(
  data: GraphQLProductCardsData | null | undefined,
): GraphQLProductCardResult[] {
  return (data?.products?.results ?? []).filter(
    (result): result is GraphQLProductCardResult => Boolean(result?.id),
  );
}

export type GraphQLHydrateDecision =
  | { type: "use-data"; data: GraphQLProductCardsData; warnings: string[] }
  | { type: "fallback"; reason: string };

/**
 * Prefer usable GraphQL `data` even when field-level `errors` are present.
 * Fall back to REST only when there is no products result payload.
 */
export function decideGraphQLProductCardsHydrate(body: {
  data?: GraphQLProductCardsData | null;
  errors?: Array<{ message: string }> | null;
}): GraphQLHydrateDecision {
  const warnings = (body.errors ?? []).map((error) => error.message).filter(Boolean);
  const data = body.data ?? undefined;
  const hasResultsPayload = Array.isArray(data?.products?.results);

  if (hasResultsPayload) {
    return { type: "use-data", data: data, warnings };
  }

  if (warnings.length > 0) {
    return { type: "fallback", reason: warnings.join("; ") };
  }

  return {
    type: "use-data",
    data: data ?? { products: { results: [] } },
    warnings: [],
  };
}
