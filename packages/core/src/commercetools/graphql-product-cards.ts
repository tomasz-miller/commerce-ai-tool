import type { ProductCard } from "../types/index.js";

/** Max product IDs per GraphQL `products` query (commercetools pagination). */
export const GRAPHQL_PRODUCT_CARD_CHUNK_SIZE = 100;

/**
 * Card hydrate query — do not use `localeProjection` with `name(locale:)`.
 * CT docs apply localeProjection to `nameAllLocales`; combining both can yield null names.
 */
export const PRODUCT_CARDS_GRAPHQL_QUERY = `
query ProductCards(
  $where: String!
  $limit: Int!
  $locale: Locale!
  $locales: [Locale!]
  $currency: Currency!
  $country: Country
) {
  products(where: $where, limit: $limit) {
    results {
      id
      key
      masterData {
        current {
          name(locale: $locale, acceptLanguage: $locales)
          description(locale: $locale, acceptLanguage: $locales)
          slug(locale: $locale, acceptLanguage: $locales)
          nameAllLocales { locale value }
          descriptionAllLocales { locale value }
          slugAllLocales { locale value }
          masterVariant {
            id
            sku
            images { url }
            price(currency: $currency, country: $country) {
              value { centAmount currencyCode fractionDigits }
            }
          }
        }
      }
    }
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
  descriptionAllLocales?: Array<GraphQLLocalizedStringEntry | null> | null;
  slugAllLocales?: Array<GraphQLLocalizedStringEntry | null> | null;
  masterVariant?: GraphQLProductCardVariant | null;
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
  locale: string;
  locales: string[];
  currency: string;
  country?: string;
}

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
): ProductCardsGraphQLVariables {
  const variables: ProductCardsGraphQLVariables = {
    where: buildProductIdsWhere(productIds),
    limit: productIds.length,
    locale,
    locales: buildAcceptLanguageLocales(locale),
    currency,
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
): ProductCard | null {
  const current = product.masterData?.current;
  if (!current) {
    return null;
  }

  const preferredLocales = buildAcceptLanguageLocales(locale);
  const name =
    pickLocalizedValue(current.name, current.nameAllLocales, preferredLocales) ??
    "Unnamed product";
  const description = pickLocalizedValue(
    current.description,
    current.descriptionAllLocales,
    preferredLocales,
  );
  const slug = pickLocalizedValue(current.slug, current.slugAllLocales, preferredLocales);

  const variant = current.masterVariant;
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
          formatted: new Intl.NumberFormat(locale, {
            style: "currency",
            currency: priceValue.currencyCode,
          }).format(amount ?? 0),
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
): ProductCard[] {
  const orderMap = new Map(productIds.map((id, index) => [id, index]));
  const cards: ProductCard[] = [];

  for (const product of results ?? []) {
    if (!product) {
      continue;
    }
    const card = mapGraphQLProductToCard(product, locale);
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
    return { type: "use-data", data: data!, warnings };
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
