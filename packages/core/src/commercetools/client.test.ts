import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inspect } from "node:util";
import type { CommercetoolsConfig, InterpretedSearchQuery } from "../types/index.js";

const PROJECT_KEY = "test-project";
const API_PREFIX = `/${PROJECT_KEY}`;
const PASSWORD = "correct-horse-battery-staple";

const baseConfig: CommercetoolsConfig = {
  projectKey: PROJECT_KEY,
  clientId: "client-id",
  clientSecret: "client-secret",
  region: "europe-west1.gcp",
};

interface RecordedCall {
  method: string;
  url: URL;
  body: string | undefined;
}

interface FakeResponse {
  status?: number;
  body: unknown;
}

/**
 * Replaces the global `fetch` (the client's default `httpClient`) with a router. Token requests
 * are answered here; every other call goes to `handler` and is recorded in `calls`.
 */
function installFakeFetch(handler: (call: RecordedCall) => FakeResponse | "hang") {
  const calls: RecordedCall[] = [];
  const tokenBodies: string[] = [];
  const tokenSignals: Array<AbortSignal | undefined> = [];
  const fakeFetch = vi.fn((input: unknown, init?: {
    method?: string;
    body?: unknown;
    signal?: AbortSignal;
  }) => {
    const url = new URL(String(input));
    const call: RecordedCall = {
      method: init?.method ?? "GET",
      url,
      body: typeof init?.body === "string" ? init.body : undefined,
    };
    if (url.pathname === "/oauth/token") {
      tokenBodies.push(call.body ?? "");
      tokenSignals.push(init?.signal);
      return Promise.resolve(
        new Response(
          JSON.stringify({ access_token: "token", expires_in: 3600, token_type: "Bearer" }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    }
    calls.push(call);
    const outcome = handler(call);
    if (outcome === "hang") {
      // Never answers; rejects like fetch when the request's signal aborts.
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("This operation was aborted", "AbortError")),
        );
      });
    }
    const { status = 200, body } = outcome;
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    );
  });
  vi.stubGlobal("fetch", fakeFetch);
  return { calls, tokenBodies, tokenSignals };
}

/** A fresh module graph per test: the once-per-process deprecation warning is module state. */
async function loadCreateClient() {
  const module = await import("./client.js");
  return module.createCommercetoolsClient;
}

/** Cart and search helpers from the same module graph as `loadCreateClient` (class identity). */
async function loadHelpers() {
  const cart = await import("./cart.js");
  const search = await import("./search-helpers.js");
  const paymentMap = await import("./payment-map.js");
  return {
    InvalidCredentialsError: cart.InvalidCredentialsError,
    isConcurrentModification: cart.isConcurrentModification,
    isMatchingPriceNotFound: cart.isMatchingPriceNotFound,
    isProductSearchUnavailable: search.isProductSearchUnavailable,
    isDuplicateField: paymentMap.isDuplicateField,
    isResourceNotFound: paymentMap.isResourceNotFound,
  };
}

const interpreted: InterpretedSearchQuery = {
  searchTerms: ["sneakers"],
  filters: {},
} as InterpretedSearchQuery;

const searchInput = { interpreted, catalogLocale: "en", limit: 10 };

const searchUnavailable: FakeResponse = {
  status: 404,
  body: {
    statusCode: 404,
    message: "URI not found: /test-project/products/search",
    errors: [{ code: "ObjectNotFound", message: "URI not found" }],
  },
};

describe("createCommercetoolsClient", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("product type listing pages through all results", async () => {
    const pageSize = 500;
    const total = pageSize * 2 + 3;
    const { calls } = installFakeFetch((call) => {
      const offset = Number(call.url.searchParams.get("offset") ?? "0");
      const count = Math.min(pageSize, total - offset);
      return {
        body: {
          limit: pageSize,
          offset,
          count,
          results: Array.from({ length: count }, (_, index) => ({
            id: `pt-${offset + index}`,
            version: offset + index,
            attributes: [],
          })),
        },
      };
    });
    const createClient = await loadCreateClient();
    const client = createClient(baseConfig);

    const types = await client.listProductTypes();

    expect(types).toHaveLength(total);
    expect(types[0]?.version).toBe(0);
    expect(types.at(-1)?.version).toBe(total - 1);
    expect(calls.map((call) => call.url.searchParams.get("offset"))).toEqual(["0", "500", "1000"]);
    for (const call of calls) {
      expect(call.url.pathname).toBe(`${API_PREFIX}/product-types`);
      expect(call.url.searchParams.get("limit")).toBe("500");
      expect(call.url.searchParams.get("withTotal")).toBe("false");
      expect(call.url.searchParams.get("sort")).toBe("id asc");
    }
  });

  it("falls back to Product Projection Search only when the flag is on", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { calls } = installFakeFetch((call) => {
      if (call.url.pathname === `${API_PREFIX}/products/search`) {
        return searchUnavailable;
      }
      return {
        body: { total: 1, count: 1, offset: 0, limit: 10, results: [{ id: "p1", name: { en: "One" } }] },
      };
    });
    const createClient = await loadCreateClient();

    const legacy = createClient({ ...baseConfig, legacyProductProjectionSearch: true });
    const result = await legacy.searchProducts(searchInput);
    expect(result.productIds).toEqual(["p1"]);
    expect(calls.map((call) => call.url.pathname)).toEqual([
      `${API_PREFIX}/products/search`,
      `${API_PREFIX}/product-projections/search`,
    ]);

    // Unset means off since 3.0.0 (decision D3): one deprecation warning when the flag is on.
    const deprecationWarnings = warn.mock.calls.filter((args) => String(args[0]).includes("deprecated"));
    expect(deprecationWarnings).toHaveLength(1);

    calls.length = 0;
    const strict = createClient({ ...baseConfig, legacyProductProjectionSearch: false });
    await expect(strict.searchProducts(searchInput)).rejects.toThrow(
      /Product Search API is not enabled for project "test-project"/,
    );
    expect(calls.map((call) => call.url.pathname)).toEqual([`${API_PREFIX}/products/search`]);
  });

  it("legacy Product Projection Search is off by default", async () => {
    const { calls } = installFakeFetch((call) => {
      if (call.url.pathname === `${API_PREFIX}/products/search`) {
        return searchUnavailable;
      }
      return { body: { total: 0, count: 0, offset: 0, limit: 10, results: [] } };
    });
    const createClient = await loadCreateClient();

    const client = createClient(baseConfig);
    const failure: unknown = await client.searchProducts(searchInput).then(
      () => undefined,
      (caught: unknown) => caught,
    );
    const { ProductSearchUnavailableError } = await import("./search-helpers.js");
    expect(failure).toBeInstanceOf(ProductSearchUnavailableError);
    expect((failure as Error).message).toMatch(
      /Product Search API is not enabled for project "test-project".*fallback is off/s,
    );
    expect(calls.map((call) => call.url.pathname)).toEqual([`${API_PREFIX}/products/search`]);
  });

  it("does not fall back for errors other than an unavailable Product Search", async () => {
    const { calls } = installFakeFetch(() => ({
      status: 403,
      body: { statusCode: 403, message: "Insufficient scope", errors: [{ code: "insufficient_scope" }] },
    }));
    const createClient = await loadCreateClient();
    const client = createClient({ ...baseConfig, legacyProductProjectionSearch: true });

    await expect(client.searchProducts(searchInput)).rejects.toMatchObject({ statusCode: 403 });
    expect(calls).toHaveLength(1);
  });

  it("price selection passes currency and country", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { calls } = installFakeFetch((call) => {
      if (call.url.pathname === `${API_PREFIX}/products/search`) {
        return searchUnavailable;
      }
      return {
        body: {
          total: 1,
          count: 1,
          offset: 0,
          limit: 10,
          results: [
            {
              id: "p1",
              name: { en: "One" },
              masterVariant: {
                id: 1,
                sku: "sku-1",
                prices: [
                  { country: "DE", value: { centAmount: 900, currencyCode: "USD" } },
                  { country: "US", value: { centAmount: 1500, currencyCode: "USD" } },
                  { value: { centAmount: 1000, currencyCode: "USD" } },
                ],
              },
            },
          ],
        },
      };
    });
    const createClient = await loadCreateClient();
    const client = createClient({ ...baseConfig, legacyProductProjectionSearch: true });

    const result = await client.searchProducts(searchInput, {
      currency: "USD",
      country: "US",
      locale: "en",
    });

    const projectionCall = calls.find(
      (call) => call.url.pathname === `${API_PREFIX}/product-projections/search`,
    );
    expect(projectionCall?.url.searchParams.get("priceCurrency")).toBe("USD");
    expect(projectionCall?.url.searchParams.get("priceCountry")).toBe("US");
    expect(result.projections?.[0]?.price).toMatchObject({ amount: 15, currency: "USD" });
  });

  it("no scope parameter when none configured", async () => {
    const { tokenBodies } = installFakeFetch(() => ({
      body: { limit: 500, offset: 0, count: 0, results: [] },
    }));
    const createClient = await loadCreateClient();

    await createClient(baseConfig).listProductTypes();
    expect(tokenBodies).toHaveLength(1);
    expect(tokenBodies[0]).toBe("grant_type=client_credentials");
    expect(tokenBodies[0]).not.toContain("scope");

    // An empty list is "not configured" too, never an empty scope parameter.
    await createClient({ ...baseConfig, scopes: [] }).listProductTypes();
    expect(tokenBodies[1]).not.toContain("scope");

    await createClient({
      ...baseConfig,
      scopes: [`view_published_products:${PROJECT_KEY}`, `view_product_types:${PROJECT_KEY}`],
    }).listProductTypes();
    expect(decodeURIComponent(tokenBodies[2] ?? "")).toBe(
      `grant_type=client_credentials&scope=view_published_products:${PROJECT_KEY} view_product_types:${PROJECT_KEY}`,
    );
  });

  it("a login error never carries the request body", async () => {
    installFakeFetch(() => ({
      status: 403,
      body: {
        statusCode: 403,
        message: "Insufficient scope.",
        errors: [{ code: "insufficient_scope", message: "Insufficient scope." }],
      },
    }));
    const createClient = await loadCreateClient();
    const client = createClient(baseConfig);

    const error: unknown = await client
      .loginAndMerge({ email: "shopper@example.test", password: PASSWORD })
      .then(
        () => undefined,
        (caught: unknown) => caught,
      );

    expect(error).toMatchObject({ statusCode: 403 });
    expect(JSON.stringify(error)).not.toContain(PASSWORD);
    expect(inspect(error, { depth: 12, showHidden: true })).not.toContain(PASSWORD);
    expect(error).not.toHaveProperty("originalRequest");
  });

  it("errors from ts-client (error field) map to the same domain errors as before", async () => {
    let next: FakeResponse = { body: {} };
    installFakeFetch(() => next);
    const createClient = await loadCreateClient();
    const {
      InvalidCredentialsError,
      isConcurrentModification,
      isMatchingPriceNotFound,
      isProductSearchUnavailable,
      isDuplicateField,
      isResourceNotFound,
    } = await loadHelpers();
    const client = createClient(baseConfig);
    const login = () =>
      client.loginAndMerge({ email: "shopper@example.test", password: PASSWORD }).then(
        () => undefined,
        (caught: unknown) => caught,
      );

    next = {
      status: 400,
      body: {
        statusCode: 400,
        message: "Account with the given credentials not found.",
        errors: [{ code: "InvalidCredentials", message: "Account with the given credentials not found." }],
      },
    };
    expect(await login()).toBeInstanceOf(InvalidCredentialsError);

    // A 401 without the `InvalidCredentials` code (revoked API client, missing scope) is an
    // upstream failure, not a wrong password.
    next = {
      status: 401,
      body: { statusCode: 401, message: "invalid_token", errors: [{ code: "invalid_token" }] },
    };
    const unauthorized = await login();
    expect(unauthorized).not.toBeInstanceOf(InvalidCredentialsError);
    expect(unauthorized).toMatchObject({ statusCode: 401 });

    next = {
      status: 409,
      body: {
        statusCode: 409,
        message: "Object has a different version than expected.",
        errors: [{ code: "ConcurrentModification", currentVersion: 4 }],
      },
    };
    const conflict = await login();
    expect(conflict).not.toBeInstanceOf(InvalidCredentialsError);
    expect(isConcurrentModification(conflict)).toBe(true);

    next = {
      status: 400,
      body: {
        statusCode: 400,
        message: "The product variant does not contain a price for the cart currency.",
        errors: [{ code: "MatchingPriceNotFound" }],
      },
    };
    expect(isMatchingPriceNotFound(await login())).toBe(true);

    next = {
      status: 404,
      body: { statusCode: 404, message: "ObjectNotFound", errors: [{ code: "ObjectNotFound" }] },
    };
    const missing = await login();
    expect(isProductSearchUnavailable(missing)).toBe(true);
    expect(isConcurrentModification(missing)).toBe(false);

    // `body` is deprecated in ts-client in favour of `error`: the payload must be read from
    // `error` first, and a network failure arrives wrapped as `{ body: null, error: HttpError }`.
    const errorFieldOnly = {
      statusCode: 400,
      error: { errors: [{ code: "MatchingPriceNotFound" }] },
    };
    expect(isMatchingPriceNotFound(errorFieldOnly)).toBe(true);
    expect(isConcurrentModification({ statusCode: 409, error: { errors: [] } })).toBe(true);
    expect(
      isConcurrentModification({ body: null, error: { statusCode: 409, message: "conflict" } }),
    ).toBe(true);
    expect(
      isProductSearchUnavailable({ body: null, error: { statusCode: 404, message: "URI not found: /x" } }),
    ).toBe(true);

    // payment-map predicates read the same payload.
    const duplicate = { code: "DuplicateField", message: "taken" };
    expect(isDuplicateField({ statusCode: 400, error: { errors: [duplicate] } })).toBe(true);
    expect(isDuplicateField({ statusCode: 400, body: { errors: [duplicate] } })).toBe(true);
    expect(isDuplicateField({ body: null, error: { statusCode: 400, errors: [duplicate] } })).toBe(true);
    expect(isDuplicateField({ statusCode: 400, error: { errors: [{ code: "Other" }] } })).toBe(false);
    expect(isDuplicateField({ statusCode: 409, error: { errors: [duplicate] } })).toBe(false);
    expect(isResourceNotFound({ statusCode: 404, error: { errors: [] } })).toBe(true);
    expect(isResourceNotFound({ statusCode: 400, error: { errors: [{ code: "ResourceNotFound" }] } })).toBe(
      true,
    );
    expect(isResourceNotFound({ body: null, error: { statusCode: 404 } })).toBe(true);
    expect(isResourceNotFound({ statusCode: 400, error: { errors: [{ code: "Other" }] } })).toBe(false);
  });

  it("configures read and mutation HTTP middleware, without the concurrent-modification one", async () => {
    installFakeFetch(() => ({ body: { results: [] } }));
    // Same module graph as the client under test (see `loadCreateClient`).
    const { ClientBuilder } = await import("@commercetools/ts-client");
    const withHttpMiddleware = vi.spyOn(ClientBuilder.prototype, "withHttpMiddleware");
    const withConcurrentModification = vi.spyOn(
      ClientBuilder.prototype,
      "withConcurrentModificationMiddleware",
    );
    const createClient = await loadCreateClient();

    createClient(baseConfig);

    const host = "https://api.europe-west1.gcp.commercetools.com";
    const retryBase = { maxRetries: 3, retryDelay: 200, backoff: true, maxDelay: 5000 };
    expect(withHttpMiddleware).toHaveBeenCalledTimes(2);
    expect(withHttpMiddleware).toHaveBeenNthCalledWith(1, {
      host,
      timeout: 10_000,
      enableRetry: true,
      retryConfig: { ...retryBase, retryOnAbort: true, retryCodes: [500, 502, 504] },
      includeRequestInErrorResponse: false,
    });
    // ts-client always retries 429 and 503 on top of `retryCodes`; both mean "not processed".
    expect(withHttpMiddleware).toHaveBeenNthCalledWith(2, {
      host,
      timeout: 10_000,
      enableRetry: true,
      retryConfig: { ...retryBase, retryOnAbort: false, retryCodes: [] },
      includeRequestInErrorResponse: false,
    });
    // cart.ts already retries a 409 once; the SDK middleware would retry it a second time.
    expect(withConcurrentModification).not.toHaveBeenCalled();
  });

  it("a timed-out read is retried", async () => {
    vi.useFakeTimers();
    const { calls } = installFakeFetch(() => "hang");
    const createClient = await loadCreateClient();
    const client = createClient(baseConfig);

    const outcome = client.listProductTypes().then(
      () => "resolved",
      () => "rejected",
    );
    await vi.advanceTimersByTimeAsync(120_000);

    expect(await outcome).toBe("rejected");
    // The first attempt plus maxRetries (3); each one was cut off by the 10 s timeout.
    expect(calls.filter((call) => call.url.pathname === `${API_PREFIX}/product-types`)).toHaveLength(4);
  });

  it("a timed-out mutation is not re-sent", async () => {
    vi.useFakeTimers();
    const cart = {
      id: "cart-1",
      version: 3,
      cartState: "Active",
      anonymousId: "anon-1",
      currencyCode: "EUR",
      lineItems: [],
    };
    const { calls } = installFakeFetch((call) =>
      call.method === "GET" ? { body: { results: [cart] } } : "hang",
    );
    const createClient = await loadCreateClient();
    const client = createClient(baseConfig);
    const settle = (promise: Promise<unknown>) =>
      promise.then(
        () => undefined,
        (caught: unknown) => caught,
      );

    // Cart update (POST /carts/{id}) on an existing cart.
    const update = settle(
      client.addToCart({ anonymousId: "anon-1", sku: "sku-1", quantity: 1, currency: "EUR" }),
    );
    await vi.advanceTimersByTimeAsync(120_000);
    expect(await update).toBeDefined();
    expect(calls.filter((call) => call.url.pathname === `${API_PREFIX}/carts/cart-1`)).toHaveLength(1);

    // Sign-in (POST /login).
    const login = settle(client.loginAndMerge({ email: "shopper@example.test", password: PASSWORD }));
    await vi.advanceTimersByTimeAsync(120_000);
    expect(await login).toBeDefined();
    expect(calls.filter((call) => call.url.pathname === `${API_PREFIX}/login`)).toHaveLength(1);
  });

  it("a timed-out cart create is not re-sent", async () => {
    vi.useFakeTimers();
    const { calls } = installFakeFetch((call) =>
      call.method === "GET" ? { body: { results: [] } } : "hang",
    );
    const createClient = await loadCreateClient();
    const client = createClient(baseConfig);

    const outcome = client
      .addToCart({ anonymousId: "anon-1", sku: "sku-1", quantity: 1, currency: "EUR" })
      .then(
        () => undefined,
        (caught: unknown) => caught,
      );
    await vi.advanceTimersByTimeAsync(120_000);

    expect(await outcome).toBeDefined();
    expect(calls.filter((call) => call.method === "POST" && call.url.pathname === `${API_PREFIX}/carts`)).toHaveLength(1);
  });

  describe("order and payment writes go through the mutation client", () => {
    const money = (centAmount: number) => ({
      type: "centPrecision",
      centAmount,
      currencyCode: "EUR",
      fractionDigits: 2,
    });
    const checkoutCart = {
      id: "cart-1",
      version: 3,
      cartState: "Active",
      anonymousId: "anon-1",
      currencyCode: "EUR",
      country: "DE",
      shippingAddress: { country: "DE" },
      lineItems: [
        {
          id: "line-1",
          productId: "product-1",
          name: { en: "Running shoe" },
          variant: { id: 1, sku: "RUN-1" },
          price: { id: "price-1", value: money(9900) },
          quantity: 1,
          totalPrice: money(9900),
        },
      ],
      totalPrice: money(9900),
    };
    const provider = {
      paymentInterface: "MOCK",
      listMethods: vi.fn(),
      authorize: vi.fn().mockResolvedValue({ status: "authorized", interfaceId: "psp-1" }),
    };

    /** Routes the fixed reads of `createOrder` / `authorizePayment`; the write is `onWrite`. */
    function routeCheckout(path: string, onWrite: () => FakeResponse | "hang") {
      return (call: RecordedCall): FakeResponse | "hang" => {
        if (call.method === "POST" && call.url.pathname === `${API_PREFIX}${path}`) {
          return onWrite();
        }
        if (call.url.pathname === `${API_PREFIX}/carts`) {
          return { body: { results: [checkoutCart] } };
        }
        if (call.url.pathname === `${API_PREFIX}/shipping-methods/matching-cart`) {
          return { body: { results: [] } };
        }
        if (call.url.pathname.startsWith(`${API_PREFIX}/payments/key=`)) {
          return { status: 404, body: { statusCode: 404, message: "not found", errors: [{ code: "ResourceNotFound" }] } };
        }
        throw new Error(`unexpected call ${call.method} ${call.url.pathname}`);
      };
    }

    const writes = (calls: RecordedCall[], path: string) =>
      calls.filter((call) => call.method === "POST" && call.url.pathname === `${API_PREFIX}${path}`);

    const settle = (promise: Promise<unknown>) =>
      promise.then(
        () => undefined,
        (caught: unknown) => caught,
      );

    it("createOrderFromCart is not re-sent after a timeout", async () => {
      vi.useFakeTimers();
      const { calls } = installFakeFetch(routeCheckout("/orders", () => "hang"));
      const createClient = await loadCreateClient();
      const client = createClient(baseConfig);

      const outcome = settle(client.createOrder({ anonymousId: "anon-1", orderNumber: "ORD-1" }));
      await vi.advanceTimersByTimeAsync(120_000);

      expect(await outcome).toBeDefined();
      expect(writes(calls, "/orders")).toHaveLength(1);
    });

    it.each([500, 502, 504])("createOrderFromCart is not re-sent after a %i", async (status) => {
      const { calls } = installFakeFetch(
        routeCheckout("/orders", () => ({
          status,
          body: { statusCode: status, message: "upstream failure" },
        })),
      );
      const createClient = await loadCreateClient();
      const client = createClient(baseConfig);

      const error = await settle(client.createOrder({ anonymousId: "anon-1", orderNumber: "ORD-1" }));

      expect(error).toMatchObject({ statusCode: status });
      expect(writes(calls, "/orders")).toHaveLength(1);
    });

    it("createPayment is not re-sent after a timeout", async () => {
      vi.useFakeTimers();
      const { calls } = installFakeFetch(routeCheckout("/payments", () => "hang"));
      const createClient = await loadCreateClient();
      const client = createClient(baseConfig, { payments: { provider } });

      const outcome = settle(
        client.authorizePayment({ anonymousId: "anon-1", method: "CREDIT_CARD", orderNumber: "ORD-1" }),
      );
      await vi.advanceTimersByTimeAsync(120_000);

      expect(await outcome).toBeDefined();
      expect(writes(calls, "/payments")).toHaveLength(1);
    });

    it.each([500, 502, 504])("createPayment is not re-sent after a %i", async (status) => {
      const { calls } = installFakeFetch(
        routeCheckout("/payments", () => ({
          status,
          body: { statusCode: status, message: "upstream failure" },
        })),
      );
      const createClient = await loadCreateClient();
      const client = createClient(baseConfig, { payments: { provider } });

      const error = await settle(
        client.authorizePayment({ anonymousId: "anon-1", method: "CREDIT_CARD", orderNumber: "ORD-1" }),
      );

      expect(error).toMatchObject({ statusCode: status });
      expect(writes(calls, "/payments")).toHaveLength(1);
    });
  });

  describe("a login failure never leaks the credentials", () => {
    const failures: Array<[string, FakeResponse | "hang" | "network"]> = [
      [
        "invalid credentials",
        {
          status: 400,
          body: { statusCode: 400, message: "bad credentials", errors: [{ code: "InvalidCredentials" }] },
        },
      ],
      ["server error", { status: 500, body: { statusCode: 500, message: "boom" } }],
      ["bad gateway", { status: 502, body: { statusCode: 502, message: "bad gateway" } }],
      ["timeout", "hang"],
      ["network failure", "network"],
    ];

    it.each(failures)("%s", async (_name, outcome) => {
      vi.useFakeTimers();
      if (outcome === "network") {
        vi.stubGlobal(
          "fetch",
          vi.fn((input: unknown) =>
            String(input).includes("/oauth/token")
              ? Promise.resolve(
                  new Response(
                    JSON.stringify({ access_token: "token", expires_in: 3600, token_type: "Bearer" }),
                    { status: 200, headers: { "content-type": "application/json" } },
                  ),
                )
              : Promise.reject(new TypeError("fetch failed")),
          ),
        );
      } else {
        installFakeFetch(() => outcome);
      }
      const createClient = await loadCreateClient();
      const client = createClient(baseConfig);

      const pending = client
        .loginAndMerge({ email: "shopper@example.test", password: PASSWORD })
        .then(
          () => undefined,
          (caught: unknown) => caught,
        );
      await vi.advanceTimersByTimeAsync(120_000);
      const error = await pending;

      expect(error).toBeDefined();
      expect(String(error)).not.toContain(PASSWORD);
      expect(JSON.stringify(error)).not.toContain(PASSWORD);
      expect(inspect(error, { depth: 12, showHidden: true })).not.toContain(PASSWORD);
      expect(error).not.toHaveProperty("originalRequest");
    });
  });

  it("reads and mutations share one access token", async () => {
    const { calls, tokenBodies } = installFakeFetch((call) =>
      call.method === "GET"
        ? { body: { limit: 500, offset: 0, count: 0, results: [] } }
        : { status: 403, body: { statusCode: 403, message: "Insufficient scope." } },
    );
    const createClient = await loadCreateClient();
    const client = createClient(baseConfig);

    await client.listProductTypes();
    await client.loginAndMerge({ email: "shopper@example.test", password: PASSWORD }).catch(() => undefined);
    await client.listProductTypes();

    expect(calls.map((call) => call.method)).toEqual(["GET", "POST", "GET"]);
    expect(tokenBodies).toHaveLength(1);
  });

  it("the token request has a timeout signal", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const { tokenSignals } = installFakeFetch(() => ({
      body: { limit: 500, offset: 0, count: 0, results: [] },
    }));
    const createClient = await loadCreateClient();

    await createClient(baseConfig).listProductTypes();

    expect(timeout).toHaveBeenCalledWith(10_000);
    expect(tokenSignals).toHaveLength(1);
    expect(tokenSignals[0]).toBeInstanceOf(AbortSignal);
  });
});
