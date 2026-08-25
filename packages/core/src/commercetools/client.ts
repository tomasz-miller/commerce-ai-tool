import {
  ClientBuilder,
  type Client,
  type HttpMiddlewareOptions,
} from "@commercetools/sdk-client-v2";
import { createApiBuilderFromCtpClient, type ProductSearchRequest } from "@commercetools/platform-sdk";
import type {
  AddToCartRequest,
  CartLoginRequest,
  CartLoginResult,
  CartMutationRequest,
  CartSnapshot,
  CheckoutRequest,
  CommercetoolsConfig,
  CreateOrderRequest,
  OrderSnapshot,
  ProductCard,
  SetCartAddressesRequest,
  SetShippingMethodRequest,
  ShippingMethodSnapshot,
  UpdateCartQuantityRequest,
} from "../types/index.js";
import type { ProductTypeForFacets } from "./product-types.js";
import { createCartOperations, type CartGateway } from "./cart.js";
import { createCheckoutOperations, type CheckoutGateway } from "./checkout.js";
import {
  buildProductSearchRequest,
  buildProjectionSearchQueryArgs,
  type ProductSearchBuildInput,
} from "./query-builder.js";
import {
  extractProductSearchIds,
  isProductSearchUnavailable,
  productSearchUnavailableMessage,
} from "./search-helpers.js";
import { hydrateProductCards } from "./product-card-hydrate.js";
import type { GraphQLProductCardsData } from "./graphql-product-cards.js";
import { logSearchTrace } from "../utils/dev-trace.js";
import { normalizeSearchSuggestions } from "./suggestions.js";

export interface CommercetoolsClient {
  searchProducts(
    input: ProductSearchBuildInput,
    options?: { currency?: string; locale?: string },
  ): Promise<{
    productIds: string[];
    total: number;
    projections?: ProductCard[];
    facets?: unknown;
  }>;
  listProductTypes(): Promise<ProductTypeForFacets[]>;
  getProductProjections(
    productIds: string[],
    locale: string,
    currency?: string,
    country?: string,
  ): Promise<ProductCard[]>;
  suggestSearchTerms(
    prefix: string,
    locale: string | string[],
    limit?: number,
  ): Promise<string[]>;
  getCart(anonymousId: string, locale?: string): Promise<CartSnapshot | null>;
  getCustomerCart(customerId: string, locale?: string): Promise<CartSnapshot | null>;
  addToCart(input: AddToCartRequest): Promise<CartSnapshot>;
  removeLineItem(input: CartMutationRequest): Promise<CartSnapshot>;
  changeLineItemQuantity(input: UpdateCartQuantityRequest): Promise<CartSnapshot>;
  loginAndMerge(input: CartLoginRequest): Promise<CartLoginResult>;
  setCartAddresses(input: SetCartAddressesRequest): Promise<CartSnapshot>;
  getShippingMethods(input: CheckoutRequest): Promise<ShippingMethodSnapshot[]>;
  setShippingMethod(input: SetShippingMethodRequest): Promise<CartSnapshot>;
  createOrder(input: CreateOrderRequest): Promise<OrderSnapshot>;
}

type ProjectApiRoot = ReturnType<ReturnType<typeof createApiBuilderFromCtpClient>["withProjectKey"]>;

export type { ProductSearchBuildInput, ProductSearchQueryOptions } from "./query-builder.js";

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

  const cartGateway: CartGateway & CheckoutGateway = {
    async queryCarts(where) {
      const response = await apiRoot
        .carts()
        .get({
          queryArgs: {
            where,
            limit: 1,
            sort: "lastModifiedAt desc",
          },
        })
        .execute();
      return response.body.results ?? [];
    },
    async getCartById(id) {
      const response = await apiRoot.carts().withId({ ID: id }).get().execute();
      return response.body;
    },
    async createCart(draft) {
      const response = await apiRoot.carts().post({ body: draft }).execute();
      return response.body;
    },
    async updateCart(id, version, actions) {
      const response = await apiRoot
        .carts()
        .withId({ ID: id })
        .post({ body: { version, actions } })
        .execute();
      return response.body;
    },
    async loginCustomer(input) {
      const body = {
        email: input.email,
        password: input.password,
        anonymousCartSignInMode: "MergeWithExistingCustomerCart" as const,
        ...(input.anonymousId ? { anonymousId: input.anonymousId } : {}),
        ...(input.anonymousCartId
          ? { anonymousCart: { typeId: "cart" as const, id: input.anonymousCartId } }
          : {}),
      };

      const response = await apiRoot.login().post({ body }).execute();
      const customer = response.body.customer;

      return {
        customer: {
          id: customer.id,
          email: customer.email ?? "",
        },
        cart: response.body.cart,
      };
    },
    async getShippingMethodsMatchingCart(cartId: string) {
      const response = await apiRoot
        .shippingMethods()
        .matchingCart()
        .get({ queryArgs: { cartId } })
        .execute();
      return response.body.results ?? [];
    },
    async createOrderFromCart(input: {
      cartId: string;
      version: number;
      orderNumber: string;
    }) {
      const response = await apiRoot.orders().post({
        body: {
          cart: { typeId: "cart", id: input.cartId },
          version: input.version,
          orderNumber: input.orderNumber,
        },
      }).execute();
      return response.body;
    },
  };
  const cart = createCartOperations(cartGateway);
  const checkout = createCheckoutOperations(cartGateway);

  return {
    async listProductTypes() {
      const results: ProductTypeForFacets[] = [];
      let offset = 0;
      const limit = 500;
      let hasMore = true;

      while (hasMore) {
        const response = await apiRoot.productTypes().get({ queryArgs: { limit, offset } }).execute();
        results.push(...(response.body.results as ProductTypeForFacets[]));
        hasMore = response.body.results.length === limit;
        offset += limit;
      }

      return results;
    },

    async searchProducts(input, options) {
      const body = buildProductSearchRequest(input);
      const locale = options?.locale ?? input.catalogLocale;
      const currency = options?.currency ?? input.options?.currency;

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
          input,
          currency,
          locale,
        );
      }
    },

    async getProductProjections(productIds, locale, currency = "EUR", country) {
      return hydrateProductCards(
        {
          async graphql({ query, variables }) {
            const response = await apiRoot
              .graphql()
              .post({
                body: {
                  query,
                  variables,
                },
              })
              .execute();
            return {
              data: response.body.data as GraphQLProductCardsData | undefined,
              errors: response.body.errors,
            };
          },
          async rest({ productIds: ids, locale: restLocale, currency: restCurrency, country: restCountry }) {
            return fetchProductCardsViaRest(apiRoot, ids, restLocale, restCurrency, restCountry);
          },
        },
        productIds,
        locale,
        currency,
        country,
      );
    },

    async suggestSearchTerms(prefix, localeOrLocales, limit = 8) {
      const locales = Array.isArray(localeOrLocales) ? localeOrLocales : [localeOrLocales];
      const queryArgs: Record<string, string | number | boolean> = {
        limit,
        fuzzy: true,
        staged: false,
      };
      for (const locale of locales) {
        queryArgs[`searchKeywords.${locale}`] = prefix;
      }

      logSearchTrace("commercetools", {
        api: "productProjections.suggest",
        locales,
        prefix,
        limit,
      });

      const response = await apiRoot
        .productProjections()
        .suggest()
        .get({ queryArgs })
        .execute();

      const suggestions = normalizeSearchSuggestions(response.body, locales, limit);
      logSearchTrace("commercetools", {
        api: "productProjections.suggest",
        count: suggestions.length,
      });

      return suggestions;
    },

    getCart: cart.getCart,
    getCustomerCart: cart.getCustomerCart,
    addToCart: cart.addToCart,
    removeLineItem: cart.removeLineItem,
    changeLineItemQuantity: cart.changeLineItemQuantity,
    loginAndMerge: cart.loginAndMerge,
    setCartAddresses: checkout.setCartAddresses,
    getShippingMethods: checkout.getShippingMethods,
    setShippingMethod: checkout.setShippingMethod,
    createOrder: checkout.createOrder,
  };
}

async function fetchProductCardsViaRest(
  apiRoot: ProjectApiRoot,
  productIds: string[],
  locale: string,
  currency: string,
  country?: string,
): Promise<ProductCard[]> {
  if (productIds.length === 0) {
    return [];
  }

  const where = productIds.map((id) => `"${id}"`).join(",");
  logSearchTrace("commercetools", {
    api: "productProjections.get",
    productIds,
    locale,
    currency,
    country: country ?? null,
  });

  const response = await apiRoot
    .productProjections()
    .get({
      queryArgs: {
        where: `id in (${where})`,
        localeProjection: locale,
        priceCurrency: currency,
        ...(country ? { priceCountry: country } : {}),
      },
    })
    .execute();

  const orderMap = new Map(productIds.map((id, index) => [id, index]));

  return (response.body.results ?? [])
    .map((projection) => mapProjectionToCard(projection, locale, currency, country))
    .sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
}

async function searchWithProductSearchApi(
  apiRoot: ProjectApiRoot,
  body: ProductSearchRequest,
) {
  logSearchTrace("commercetools", { api: "products.search", request: body });

  const response = await apiRoot
    .products()
    .search()
    .post({ body })
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
    facets: response.body.facets,
  };
}

async function searchWithProductProjectionSearch(
  apiRoot: ProjectApiRoot,
  input: ProductSearchBuildInput,
  currency = "EUR",
  locale = "en",
) {
  const queryArgs = buildProjectionSearchQueryArgs({
    ...input,
    options: {
      ...input.options,
      currency: currency ?? input.options?.currency,
    },
  });
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
    facets: response.body.facets,
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
      id?: number;
      sku?: string;
      images?: Array<{ url: string }>;
      prices?: Array<{
        country?: string;
        value: { centAmount: number; currencyCode: string; fractionDigits?: number };
      }>;
    };
  },
  locale: string,
  currency: string,
  country?: string,
): ProductCard {
  const variant = projection.masterVariant;
  const price = pickProjectionPrice(variant?.prices, currency, country);
  const fractionDigits = price?.value.fractionDigits ?? 2;
  const amount = price ? price.value.centAmount / Math.pow(10, fractionDigits) : undefined;

  return {
    id: projection.id,
    key: projection.key,
    name: projection.name?.[locale] ?? projection.name?.["en"] ?? "Unnamed product",
    description:
      projection.description?.[locale] ?? projection.description?.["en"] ?? undefined,
    imageUrl: variant?.images?.[0]?.url,
    sku: variant?.sku,
    variantId: variant?.id,
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

function pickProjectionPrice(
  prices:
    | Array<{
        country?: string;
        value: { centAmount: number; currencyCode: string; fractionDigits?: number };
      }>
    | undefined,
  currency: string,
  country?: string,
) {
  if (!prices?.length) {
    return undefined;
  }

  if (country) {
    const countryMatch = prices.find(
      (price) => price.value.currencyCode === currency && price.country === country,
    );
    if (countryMatch) {
      return countryMatch;
    }

    const currencyWithoutCountry = prices.find(
      (price) => price.value.currencyCode === currency && !price.country,
    );
    if (currencyWithoutCountry) {
      return currencyWithoutCountry;
    }
  }

  return prices.find((price) => price.value.currencyCode === currency) ?? prices[0];
}
