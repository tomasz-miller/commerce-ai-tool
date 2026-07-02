import {
  ClientBuilder,
  type Client,
  type HttpMiddlewareOptions,
} from "@commercetools/sdk-client-v2";
import { createApiBuilderFromCtpClient, type ProductSearchRequest } from "@commercetools/platform-sdk";
import type { CommercetoolsConfig, ProductCard } from "../types/index.js";
import type { ProductSearchQueryBody } from "../types/index.js";
import {
  buildProjectionSearchQueryArgs,
  extractProductSearchIds,
  isProductSearchUnavailable,
  productSearchUnavailableMessage,
} from "./search-helpers.js";
import { logSearchTrace } from "../utils/dev-trace.js";

export interface CommercetoolsClient {
  searchProducts(
    body: ProductSearchQueryBody,
    options?: { currency?: string; locale?: string },
  ): Promise<{
    productIds: string[];
    total: number;
    projections?: ProductCard[];
  }>;
  getProductProjections(
    productIds: string[],
    locale: string,
    currency?: string,
  ): Promise<ProductCard[]>;
}

export function createCommercetoolsClient(config: CommercetoolsConfig): CommercetoolsClient {
  const scopes = config.scopes ?? [
    `manage_project:${config.projectKey}`,
  ];

  const httpMiddlewareOptions: HttpMiddlewareOptions = {
    host: `https://api.${config.region}.commercetools.com`,
    enableRetry: true,
    retryConfig: {
      maxRetries: 3,
      retryDelay: 200,
      backoff: true,
    },
  };

  const client: Client = new ClientBuilder()
    .withProjectKey(config.projectKey)
    .withClientCredentialsFlow({
      host: `https://auth.${config.region}.commercetools.com`,
      projectKey: config.projectKey,
      credentials: {
        clientId: config.clientId,
        clientSecret: config.clientSecret,
      },
      scopes,
    })
    .withHttpMiddleware(httpMiddlewareOptions)
    .build();

  const apiRoot = createApiBuilderFromCtpClient(client).withProjectKey({
    projectKey: config.projectKey,
  });

  return {
    async searchProducts(body, options) {
      try {
        return await searchWithProductSearchApi(apiRoot, body);
      } catch (error) {
        if (!isProductSearchUnavailable(error)) {
          throw error;
        }

        if (process.env.NODE_ENV !== "production") {
          console.warn(`[commerce-ai-tool/core] ${productSearchUnavailableMessage(config.projectKey)}`);
          console.warn("[commerce-ai-tool/core] Falling back to productProjections().search()");
        }

        return searchWithProductProjectionSearch(
          apiRoot,
          body,
          options?.currency,
          options?.locale,
        );
      }
    },

    async getProductProjections(productIds, locale, currency = "EUR") {
      if (productIds.length === 0) {
        return [];
      }

      const where = productIds.map((id) => `"${id}"`).join(",");
      const response = await apiRoot
        .productProjections()
        .get({
          queryArgs: {
            where: `id in (${where})`,
            localeProjection: locale,
            currency,
          },
        })
        .execute();

      const orderMap = new Map(productIds.map((id, index) => [id, index]));

      return (response.body.results ?? [])
        .map((projection) => mapProjectionToCard(projection, locale, currency))
        .sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
    },
  };
}

async function searchWithProductSearchApi(
  apiRoot: ReturnType<ReturnType<typeof createApiBuilderFromCtpClient>["withProjectKey"]>,
  body: ProductSearchQueryBody,
) {
  logSearchTrace("commercetools", { api: "products.search", request: body });

  const response = await apiRoot
    .products()
    .search()
    .post({ body: body as ProductSearchRequest })
    .execute();

  const results = response.body.results ?? [];
  const productIds = extractProductSearchIds(results);

  const total = response.body.total ?? productIds.length;
  logSearchTrace("commercetools", {
    api: "products.search",
    total,
    productIds,
  });

  return {
    productIds,
    total,
  };
}

async function searchWithProductProjectionSearch(
  apiRoot: ReturnType<ReturnType<typeof createApiBuilderFromCtpClient>["withProjectKey"]>,
  body: ProductSearchQueryBody,
  currency = "EUR",
  locale = "en",
) {
  const queryArgs = buildProjectionSearchQueryArgs(body, currency);
  logSearchTrace("commercetools", { api: "productProjections.search", request: queryArgs });

  const response = await apiRoot
    .productProjections()
    .search()
    .get({
      queryArgs,
    })
    .execute();

  const results = response.body.results ?? [];
  const productIds = results.map((projection) => projection.id).filter(Boolean);
  const projections = results.map((projection) =>
    mapProjectionToCard(projection, locale, currency),
  );

  const total = response.body.total ?? productIds.length;
  logSearchTrace("commercetools", {
    api: "productProjections.search",
    total,
    productIds,
  });

  return {
    productIds,
    total,
    projections,
  };
}

function mapProjectionToCard(
  projection: {
    id: string;
    key?: string;
    name?: Record<string, string>;
    description?: Record<string, string>;
    slug?: Record<string, string>;
    masterVariant?: {
      images?: Array<{ url: string }>;
      prices?: Array<{
        value: { centAmount: number; currencyCode: string; fractionDigits?: number };
      }>;
    };
  },
  locale: string,
  currency: string,
): ProductCard {
  const variant = projection.masterVariant;
  const price = variant?.prices?.find((p) => p.value.currencyCode === currency) ?? variant?.prices?.[0];
  const fractionDigits = price?.value.fractionDigits ?? 2;
  const amount = price ? price.value.centAmount / Math.pow(10, fractionDigits) : undefined;

  return {
    id: projection.id,
    key: projection.key,
    name: projection.name?.[locale] ?? projection.name?.["en"] ?? "Unnamed product",
    description:
      projection.description?.[locale] ?? projection.description?.["en"] ?? undefined,
    imageUrl: variant?.images?.[0]?.url,
    slug: projection.slug?.[locale] ?? projection.slug?.["en"],
    price: price
      ? {
          amount: amount ?? 0,
          currency: price.value.currencyCode,
          formatted: new Intl.NumberFormat(locale, {
            style: "currency",
            currency: price.value.currencyCode,
          }).format(amount ?? 0),
        }
      : undefined,
  };
}
