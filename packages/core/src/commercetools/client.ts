import {
  ClientBuilder,
  type Client,
  type HttpMiddlewareOptions,
  type RetryOptions,
  type TokenStore,
} from "@commercetools/ts-client";
import {
  createApiBuilderFromCtpClient,
  type PaymentState,
  type ProductSearchRequest,
} from "@commercetools/platform-sdk";
import type {
  AddItemsToCartRequest,
  AddToCartRequest,
  AuthorizePaymentRequest,
  CartLoginRequest,
  CartLoginResult,
  CartMutationRequest,
  CartSnapshot,
  CheckoutRequest,
  CommercetoolsConfig,
  CreateOrderRequest,
  GetOrderRequest,
  ListOrdersRequest,
  OrderSnapshot,
  CartPolicy,
  PaymentConfig,
  PaymentMethodOption,
  PaymentSnapshot,
  ProductCard,
  SetCartAddressesRequest,
  SetShippingMethodRequest,
  ShippingMethodSnapshot,
  UpdateCartQuantityRequest,
} from "../types/index.js";
import type { ProductTypeForFacets } from "./product-types.js";
import {
  buildCustomerSignin,
  createCartOperations,
  formatCurrency,
  type CartGateway,
} from "./cart.js";
import { createCheckoutOperations } from "./checkout.js";
import { buildOrderFromCartDraft, createOrderOperations, type OrderGateway } from "./order.js";
import { createPaymentOperations, type PaymentGateway } from "./payment.js";
import {
  buildProductSearchRequest,
  buildProjectionSearchQueryArgs,
  type ProductSearchBuildInput,
} from "./query-builder.js";
import {
  extractMatchedSkus,
  extractProductSearchIds,
  isProductSearchUnavailable,
  ProductSearchUnavailableError,
  productSearchUnavailableMessage,
} from "./search-helpers.js";
import { hydrateProductCards } from "./product-card-hydrate.js";
import {
  buildAcceptLanguageLocales,
  type GraphQLProductCardsData,
  type MatchedSkus,
} from "./graphql-product-cards.js";
import {
  CATEGORY_NAMES_GRAPHQL_QUERY,
  buildCategoryIdsWhere,
  parseCategoryNamesResponse,
} from "./category-labels.js";
import { logSearchTrace } from "../utils/dev-trace.js";
import { normalizeSearchSuggestions } from "./suggestions.js";

export interface CommercetoolsClient {
  searchProducts(
    input: ProductSearchBuildInput,
    options?: { currency?: string; country?: string; locale?: string },
  ): Promise<{
    productIds: string[];
    total: number;
    projections?: ProductCard[];
    facets?: unknown;
    /**
     * Product id -> sku of the first matching variant, for products where Product Search
     * matched only some variants. Absent on the Product Projection Search fallback.
     */
    matchedSkus?: MatchedSkus;
  }>;
  listProductTypes(): Promise<ProductTypeForFacets[]>;
  getProductProjections(
    productIds: string[],
    locale: string,
    currency?: string,
    country?: string,
    options?: { matchedSkus?: MatchedSkus },
  ): Promise<ProductCard[]>;
  /**
   * Localized names of the given category ids (ids without a name are left out). Optional so
   * custom clients written against earlier versions still type-check; without it the
   * categories facet shows ids.
   */
  getCategoryNames?(ids: string[], locale: string): Promise<Record<string, string>>;
  suggestSearchTerms(
    prefix: string,
    locale: string | string[],
    limit?: number,
  ): Promise<string[]>;
  getCart(anonymousId: string, locale?: string): Promise<CartSnapshot | null>;
  getCustomerCart(customerId: string, locale?: string): Promise<CartSnapshot | null>;
  addToCart(input: AddToCartRequest): Promise<CartSnapshot>;
  addItemsToCart(input: AddItemsToCartRequest): Promise<CartSnapshot>;
  removeLineItem(input: CartMutationRequest): Promise<CartSnapshot>;
  changeLineItemQuantity(input: UpdateCartQuantityRequest): Promise<CartSnapshot>;
  loginAndMerge(input: CartLoginRequest): Promise<CartLoginResult>;
  setCartAddresses(input: SetCartAddressesRequest): Promise<CartSnapshot>;
  getShippingMethods(input: CheckoutRequest): Promise<ShippingMethodSnapshot[]>;
  setShippingMethod(input: SetShippingMethodRequest): Promise<CartSnapshot>;
  createOrder(input: CreateOrderRequest): Promise<OrderSnapshot>;
  listPaymentMethods(context: {
    locale?: string;
    country?: string;
  }): Promise<PaymentMethodOption[]>;
  authorizePayment(
    input: AuthorizePaymentRequest,
  ): Promise<{ payment: PaymentSnapshot; cart: CartSnapshot }>;
  getOrder(input: GetOrderRequest): Promise<OrderSnapshot>;
  listOrders(input: ListOrdersRequest): Promise<OrderSnapshot[]>;
}

type ProjectApiRoot = ReturnType<ReturnType<typeof createApiBuilderFromCtpClient>["withProjectKey"]>;

export type { ProductSearchBuildInput, ProductSearchQueryOptions } from "./query-builder.js";

export function createCommercetoolsClient(
  config: CommercetoolsConfig,
  options?: { payments?: PaymentConfig; cartPolicy?: CartPolicy },
): CommercetoolsClient {
  // No default scope: when none is configured the scope parameter is omitted and the token gets
  // exactly the scopes of the API client created in the Merchant Center. Defaulting to
  // `manage_project` made every host run with a full-admin token.
  const scopes = config.scopes?.length ? config.scopes : undefined;
  const legacyProductProjectionSearch = config.legacyProductProjectionSearch ?? false;

  const REQUEST_TIMEOUT_MS = 10_000;
  const retryBase = { maxRetries: 3, retryDelay: 200, backoff: true, maxDelay: 5000 } as const;

  const buildHttpMiddlewareOptions = (retryConfig: RetryOptions): HttpMiddlewareOptions => ({
    host: `https://api.${config.region}.commercetools.com`,
    timeout: REQUEST_TIMEOUT_MS,
    enableRetry: true,
    retryConfig,
    // Keep the request (the /login body holds the plaintext password) off error objects.
    includeRequestInErrorResponse: false,
  });

  // Reads, Product Search and GraphQL are safe to repeat. ts-client aborts a request that exceeds
  // `timeout` and `retryOnAbort` retries it; no caller signal ever reaches this client (the
  // pipeline only races it with `withTimeout`), so a caller abort is never retried. 429 and 503
  // are always retried by ts-client on top of `retryCodes`.
  const readHttpOptions = buildHttpMiddlewareOptions({
    ...retryBase,
    retryOnAbort: true,
    retryCodes: [500, 502, 504],
  });
  // Mutations (cart/order/payment create and update, sign-in) must not be re-sent after a timeout
  // or a 5xx: the first attempt may have committed, and re-sending a cart update would 409 and
  // then be re-applied by cart.ts `updateWithRetry` (doubled quantities). With `retryCodes: []`
  // only the built-in 429 and 503 remain, both "not processed" responses.
  const mutationHttpOptions = buildHttpMiddlewareOptions({
    ...retryBase,
    retryOnAbort: false,
    retryCodes: [],
  });

  // Both clients share one token: the cache is read and written by each auth middleware.
  let cachedToken: TokenStore | undefined;
  const tokenCache = {
    get: () => Promise.resolve(cachedToken),
    set: (value: TokenStore) => {
      cachedToken = value;
      return Promise.resolve();
    },
  };

  // The token request goes through the auth middleware's own `httpClient`, which has no timeout
  // setting, so the abort signal is added here.
  const tokenHttpClient = (url: string, init?: RequestInit) =>
    fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });

  // No concurrent-modification middleware: cart.ts retries a 409 once with the latest version,
  // so the middleware would retry it a second time.
  const buildClient = (httpOptions: HttpMiddlewareOptions): Client =>
    new ClientBuilder()
      .withProjectKey(config.projectKey)
      .withClientCredentialsFlow({
        host: `https://auth.${config.region}.commercetools.com`,
        projectKey: config.projectKey,
        credentials: {
          clientId: config.clientId,
          clientSecret: config.clientSecret,
        },
        ...(scopes ? { scopes } : {}),
        tokenCache,
        httpClient: tokenHttpClient,
      })
      .withHttpMiddleware(httpOptions)
      .build();

  const apiRoot = createApiBuilderFromCtpClient(buildClient(readHttpOptions)).withProjectKey({
    projectKey: config.projectKey,
  });
  const mutationApiRoot = createApiBuilderFromCtpClient(
    buildClient(mutationHttpOptions),
  ).withProjectKey({ projectKey: config.projectKey });

  const cartGateway: CartGateway & PaymentGateway & OrderGateway = {
    async queryCarts(where) {
      const response = await apiRoot
        .carts()
        .get({
          queryArgs: {
            where,
            limit: 1,
            sort: "lastModifiedAt desc",
            expand: ["paymentInfo.payments"],
          },
        })
        .execute();
      return response.body.results ?? [];
    },
    async getCartById(id) {
      const response = await apiRoot
        .carts()
        .withId({ ID: id })
        .get({ queryArgs: { expand: ["paymentInfo.payments"] } })
        .execute();
      return response.body;
    },
    async createCart(draft) {
      const response = await mutationApiRoot.carts().post({ body: draft }).execute();
      return response.body;
    },
    async updateCart(id, version, actions) {
      const response = await mutationApiRoot
        .carts()
        .withId({ ID: id })
        .post({ body: { version, actions } })
        .execute();
      return response.body;
    },
    async loginCustomer(input) {
      const response = await mutationApiRoot
        .login()
        .post({ body: buildCustomerSignin(input) })
        .execute();
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
      paymentState?: PaymentState;
    }) {
      const response = await mutationApiRoot
        .orders()
        .post({ body: buildOrderFromCartDraft(input) })
        .execute();
      return response.body;
    },
    async createPayment(draft) {
      const response = await mutationApiRoot.payments().post({ body: draft }).execute();
      return response.body;
    },
    async getPaymentById(id) {
      const response = await apiRoot.payments().withId({ ID: id }).get().execute();
      return response.body;
    },
    async getPaymentByKey(key) {
      const response = await apiRoot.payments().withKey({ key }).get().execute();
      return response.body;
    },
    async queryOrders(where, options) {
      const response = await apiRoot
        .orders()
        .get({
          queryArgs: {
            where,
            limit: options?.limit ?? 1,
            sort: "createdAt desc",
            expand: ["paymentInfo.payments"],
          },
        })
        .execute();
      return response.body.results ?? [];
    },
  };
  const requirePayment =
    options?.payments?.requiredForOrder ?? Boolean(options?.payments?.provider);
  const cart = createCartOperations(cartGateway);
  const shippingScope = {
    allowedCountries: options?.cartPolicy?.allowedCountries,
    currencyByCountry: options?.cartPolicy?.currencyByCountry,
  };
  const checkout = createCheckoutOperations(cartGateway, { requirePayment, ...shippingScope });
  const payments = createPaymentOperations(
    cartGateway,
    options?.payments?.provider,
    shippingScope,
  );
  const orders = createOrderOperations(cartGateway);

  return {
    async listProductTypes() {
      const results: ProductTypeForFacets[] = [];
      let offset = 0;
      const limit = 500;
      let hasMore = true;

      while (hasMore) {
        const response = await apiRoot
          .productTypes()
          .get({ queryArgs: { limit, offset, sort: ["id asc"], withTotal: false } })
          .execute();
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
      const country = options?.country ?? input.options?.country;

      try {
        return await searchWithProductSearchApi(apiRoot, body);
      } catch (error) {
        if (!isProductSearchUnavailable(error)) {
          throw error;
        }

        if (!legacyProductProjectionSearch) {
          throw new ProductSearchUnavailableError(
            productSearchUnavailableMessage(config.projectKey, { legacyFallback: false }),
            { cause: error },
          );
        }

        warnLegacyProductProjectionSearch(config.projectKey);

        return searchWithProductProjectionSearch(apiRoot, input, currency, locale, country);
      }
    },

    async getProductProjections(productIds, locale, currency = "EUR", country, options) {
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
          async rest({
            productIds: ids,
            locale: restLocale,
            currency: restCurrency,
            country: restCountry,
            matchedSkus,
          }) {
            return fetchProductCardsViaRest(
              apiRoot,
              ids,
              restLocale,
              restCurrency,
              restCountry,
              matchedSkus,
            );
          },
        },
        productIds,
        locale,
        currency,
        country,
        options?.matchedSkus,
      );
    },

    async getCategoryNames(ids, locale) {
      if (ids.length === 0) {
        return {};
      }
      const response = await apiRoot
        .graphql()
        .post({
          body: {
            query: CATEGORY_NAMES_GRAPHQL_QUERY,
            variables: {
              where: buildCategoryIdsWhere(ids),
              limit: ids.length,
              locales: buildAcceptLanguageLocales(locale),
            },
          },
        })
        .execute();
      return parseCategoryNamesResponse({
        data: response.body.data as Parameters<typeof parseCategoryNamesResponse>[0]["data"],
        errors: response.body.errors,
      });
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

    /* eslint-disable @typescript-eslint/unbound-method -- the cart, checkout, payment and order modules are closures that never use `this`; the methods are re-exported unbound on purpose */
    getCart: cart.getCart,
    getCustomerCart: cart.getCustomerCart,
    addToCart: cart.addToCart,
    addItemsToCart: cart.addItemsToCart,
    removeLineItem: cart.removeLineItem,
    changeLineItemQuantity: cart.changeLineItemQuantity,
    loginAndMerge: cart.loginAndMerge,
    setCartAddresses: checkout.setCartAddresses,
    getShippingMethods: checkout.getShippingMethods,
    setShippingMethod: checkout.setShippingMethod,
    createOrder: checkout.createOrder,
    listPaymentMethods: payments.listPaymentMethods,
    authorizePayment: payments.authorizePayment,
    getOrder: orders.getOrder,
    listOrders: orders.listOrders,
    /* eslint-enable @typescript-eslint/unbound-method */
  };
}

async function fetchProductCardsViaRest(
  apiRoot: ProjectApiRoot,
  productIds: string[],
  locale: string,
  currency: string,
  country?: string,
  matchedSkus: MatchedSkus = {},
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
    .map((projection) =>
      mapProjectionToCard(projection, locale, currency, country, matchedSkus[projection.id]),
    )
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
  const matchedSkus = extractMatchedSkus(results);

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
    matchedSkus,
  };
}

let legacySearchWarned = false;

/** Product Projection Search cannot be activated on projects created after 31 August 2026. */
function warnLegacyProductProjectionSearch(projectKey: string): void {
  if (legacySearchWarned) {
    return;
  }
  legacySearchWarned = true;
  console.warn(
    `[commerce-ai-tool/core] ${productSearchUnavailableMessage(projectKey, { legacyFallback: true })} ` +
      "Product Projection Search is deprecated by commercetools and is only used because " +
      "CAT_LEGACY_PRODUCT_PROJECTION_SEARCH=true: enable Product Search and remove the flag.",
  );
}

async function searchWithProductProjectionSearch(
  apiRoot: ProjectApiRoot,
  input: ProductSearchBuildInput,
  currency = "EUR",
  locale = "en",
  country?: string,
) {
  const queryArgs = buildProjectionSearchQueryArgs({
    ...input,
    options: {
      ...input.options,
      currency: currency ?? input.options?.currency,
      country: country ?? input.options?.country,
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
    mapProjectionToCard(projection, locale, currency, country),
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

type ProjectionCardVariant = {
  id?: number;
  sku?: string;
  images?: Array<{ url: string }>;
  prices?: Array<{
    country?: string;
    value: { centAmount: number; currencyCode: string; fractionDigits?: number };
  }>;
};

function mapProjectionToCard(
  projection: {
    id: string;
    key?: string;
    name?: Record<string, string>;
    description?: Record<string, string>;
    slug?: Record<string, string>;
    masterVariant?: ProjectionCardVariant;
    variants?: ProjectionCardVariant[];
  },
  locale: string,
  currency: string,
  country?: string,
  matchedSku?: string,
): ProductCard {
  // Same rule as the GraphQL hydrate: the matched variant when known, else the master.
  const matchedVariant = matchedSku
    ? [projection.masterVariant, ...(projection.variants ?? [])].find(
        (candidate) => candidate?.sku === matchedSku,
      )
    : undefined;
  const variant = matchedVariant ?? projection.masterVariant;
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
          formatted: formatCurrency(amount ?? 0, price.value.currencyCode, locale),
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
