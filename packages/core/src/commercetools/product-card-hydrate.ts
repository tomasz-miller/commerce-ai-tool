import type { ProductCard } from "../types/index.js";
import { logSearchTrace } from "../utils/dev-trace.js";
import {
  PRODUCT_CARDS_GRAPHQL_QUERY,
  buildProductCardsGraphQLVariables,
  chunkProductIds,
  decideGraphQLProductCardsHydrate,
  extractGraphQLProductResults,
  mapGraphQLProductsToCards,
  type GraphQLProductCardsData,
  type ProductCardsGraphQLVariables,
} from "./graphql-product-cards.js";

export interface ProductCardHydrateTransport {
  graphql(input: {
    query: string;
    variables: ProductCardsGraphQLVariables;
  }): Promise<{
    data?: GraphQLProductCardsData | null;
    errors?: Array<{ message: string }> | null;
  }>;
  rest(input: {
    productIds: string[];
    locale: string;
    currency: string;
    country?: string;
  }): Promise<ProductCard[]>;
}

/**
 * Hydrate ProductCards via GraphQL, falling back to REST on hard failures.
 * Field-level GraphQL errors with a usable `products.results` payload do not trigger fallback.
 */
export async function hydrateProductCards(
  transport: ProductCardHydrateTransport,
  productIds: string[],
  locale: string,
  currency: string,
  country?: string,
): Promise<ProductCard[]> {
  if (productIds.length === 0) {
    return [];
  }

  try {
    return await hydrateProductCardsViaGraphQL(transport, productIds, locale, currency, country);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[commerce-ai-tool/core] GraphQL product card hydrate failed; falling back to productProjections().get()",
        error instanceof Error ? error.message : error,
      );
    }
    return transport.rest({ productIds, locale, currency, country });
  }
}

async function hydrateProductCardsViaGraphQL(
  transport: ProductCardHydrateTransport,
  productIds: string[],
  locale: string,
  currency: string,
  country?: string,
): Promise<ProductCard[]> {
  const cards: ProductCard[] = [];

  for (const chunk of chunkProductIds(productIds)) {
    const variables = buildProductCardsGraphQLVariables(chunk, locale, currency, country);
    logSearchTrace("commercetools", {
      api: "graphql.products",
      productIds: chunk,
      locale,
      currency,
      country: country ?? null,
    });

    const body = await transport.graphql({
      query: PRODUCT_CARDS_GRAPHQL_QUERY,
      variables,
    });

    const decision = decideGraphQLProductCardsHydrate(body);
    if (decision.type === "fallback") {
      throw new Error(`GraphQL product cards query failed: ${decision.reason}`);
    }

    if (decision.warnings.length > 0 && process.env.NODE_ENV !== "production") {
      console.warn(
        "[commerce-ai-tool/core] GraphQL product card hydrate returned field errors; using data payload",
        decision.warnings.join("; "),
      );
    }

    const results = extractGraphQLProductResults(decision.data);
    cards.push(...mapGraphQLProductsToCards(results, chunk, locale));
  }

  const orderMap = new Map(productIds.map((id, index) => [id, index]));
  return cards.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
}
