import {
  ANONYMOUS_ID_HEADER,
  CART_SESSION_HEADER,
  InvalidCredentialsError,
  VoiceNotConfiguredError,
  type CartSnapshot,
  type CommercetoolsClient,
  type SearchOrchestrator,
} from "@commerce-ai-tool/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { signCartSession } from "./cart-session.js";
import { MAX_AUDIO_BYTES, MAX_IMAGE_BYTES, MAX_JSON_BODY_BYTES } from "./input-limits.js";
import { createNextHandlers, type NextHandlerOptions } from "./next.js";
import {
  AI_RATE_LIMIT_MESSAGE,
  LOGIN_RATE_LIMIT_MESSAGE,
  ORDER_RATE_LIMIT_MESSAGE,
  PAYMENT_RATE_LIMIT_MESSAGE,
} from "./rate-limit.js";
import { registerLangfuseFlush } from "./observability/flush.js";
import type { CommerceAIServer } from "./server.js";

vi.mock("./server.js", () => ({
  createCommerceAIServer: vi.fn(),
}));

import { createCommerceAIServer } from "./server.js";

const sampleCart: CartSnapshot = {
  id: "cart-1",
  version: 1,
  anonymousId: "anon-1",
  lineItems: [],
  totalPrice: { amount: 0, currency: "EUR", formatted: "€0.00" },
  totalQuantity: 0,
};

function createMockServer(): CommerceAIServer {
  return {
    orchestrator: {
      searchByText: vi.fn().mockResolvedValue({
        products: [],
        meta: { total: 0 },
      }),
      searchByVoice: vi.fn(),
      searchByImage: vi.fn(),
      suggestByText: vi.fn().mockResolvedValue({
        suggestions: ["Red Shoes"],
      }),
      getFacetSchema: vi.fn().mockResolvedValue({ attributes: [], systemFacets: [], etag: "e", resolvedAt: "2026-01-01T00:00:00.000Z" }),
    } as unknown as SearchOrchestrator,
    commercetools: {
      getCart: vi.fn().mockResolvedValue(sampleCart),
      getCustomerCart: vi.fn().mockResolvedValue(sampleCart),
      addToCart: vi.fn().mockResolvedValue(sampleCart),
      addItemsToCart: vi.fn().mockResolvedValue(sampleCart),
      removeLineItem: vi.fn().mockResolvedValue(sampleCart),
      changeLineItemQuantity: vi.fn().mockResolvedValue(sampleCart),
      loginAndMerge: vi.fn(),
      getOrder: vi.fn().mockResolvedValue({ id: "order-1" }),
      listOrders: vi.fn().mockResolvedValue([]),
      getShippingMethods: vi.fn().mockResolvedValue([]),
      listPaymentMethods: vi.fn().mockResolvedValue([]),
    } as unknown as CommercetoolsClient,
    cartDefaults: { currency: "EUR", catalogLocale: "en" },
    cartSessionSecret: "test-secret",
    transcribeAudio: vi.fn(),
    synthesizeSpeech: vi.fn().mockResolvedValue(Buffer.from("mp3-bytes")),
  };
}

describe("package entry points", () => {
  it("export createNextHandlers and createNextRouteHandler from the root and ./next entries", async () => {
    const root = await import("./index.js");
    const next = await import("./next.js");

    expect(root.createNextHandlers).toBe(next.createNextHandlers);
    expect(typeof root.createNextRouteHandler).toBe("function");
    expect(root.createNextRouteHandler).toBe(next.createNextRouteHandler);
  });
});

describe("createNextHandlers", () => {
  afterEach(() => {
    vi.mocked(createCommerceAIServer).mockReset();
  });

  it("search uses shared route actions", async () => {
    const server = createMockServer();
    vi.mocked(createCommerceAIServer).mockReturnValue(server);

    const handlers = createNextHandlers({} as never);
    const response = await handlers.search(
      new Request("http://localhost/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "hat" }),
      }),
    );

    expect(server.orchestrator.searchByText).toHaveBeenCalledWith(
      expect.objectContaining({ query: "hat" }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      products: [],
      meta: { total: 0 },
    });
  });

  it("searchSuggestions uses shared route actions", async () => {
    const server = createMockServer();
    vi.mocked(createCommerceAIServer).mockReturnValue(server);

    const handlers = createNextHandlers({} as never);
    const response = await handlers.searchSuggestions(
      new Request("http://localhost/search/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "red" }),
      }),
    );

    expect(server.orchestrator.suggestByText).toHaveBeenCalledWith(
      expect.objectContaining({ query: "red" }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      suggestions: ["Red Shoes"],
    });
  });

  it("search maps malformed JSON to 400 VALIDATION", async () => {
    vi.mocked(createCommerceAIServer).mockReturnValue(createMockServer());

    const handlers = createNextHandlers({} as never);
    const response = await handlers.search(
      new Request("http://localhost/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid JSON body",
      code: "VALIDATION",
    });
  });

  it("returns the generic fallback for unknown errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const server = createMockServer();
    vi.mocked(server.orchestrator.searchByText).mockRejectedValue(
      new Error("ECONNRESET at 10.0.0.1"),
    );
    vi.mocked(createCommerceAIServer).mockReturnValue(server);

    const handlers = createNextHandlers({} as never);
    const response = await handlers.search(
      new Request("http://localhost/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "hat" }),
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Search failed", code: "INTERNAL" });
  });

  it("a Next ResponseAborted reason maps to 499 and is not logged", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warnLog = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const server = createMockServer();
    vi.mocked(server.orchestrator.searchByText).mockImplementation(
      (request) =>
        new Promise((_resolve, reject) => {
          request.signal?.addEventListener("abort", () => {
            reject(request.signal?.reason as Error);
          });
        }),
    );
    vi.mocked(createCommerceAIServer).mockReturnValue(server);
    const client = new AbortController();

    const handlers = createNextHandlers({} as never);
    const pending = handlers.search(
      new Request("http://localhost/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "hat" }),
        signal: client.signal,
      }),
    );
    await vi.waitFor(() =>
      expect(vi.mocked(server.orchestrator.searchByText)).toHaveBeenCalled(),
    );
    client.abort(Object.assign(new Error("aborted"), { name: "ResponseAborted" }));

    const response = await pending;
    expect(response.status).toBe(499);
    expect(errorLog).not.toHaveBeenCalled();
    expect(warnLog).not.toHaveBeenCalled();
  });

  it("aborting the request aborts the AI call", async () => {
    const server = createMockServer();
    let seenSignal: AbortSignal | undefined;
    vi.mocked(server.orchestrator.searchByText).mockImplementation(
      (request) =>
        new Promise((_resolve, reject) => {
          seenSignal = request.signal;
          request.signal?.addEventListener("abort", () => {
            reject(request.signal?.reason as Error);
          });
        }),
    );
    vi.mocked(createCommerceAIServer).mockReturnValue(server);
    const client = new AbortController();

    const handlers = createNextHandlers({} as never);
    const pending = handlers.search(
      new Request("http://localhost/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "hat" }),
        signal: client.signal,
      }),
    );
    await vi.waitFor(() => expect(seenSignal).toBeDefined());
    expect(seenSignal?.aborted).toBe(false);

    client.abort();

    const response = await pending;
    expect(seenSignal?.aborted).toBe(true);
    expect(response.status).toBe(499);
  });

  it("passes req.signal to suggestions, voice and image searches", async () => {
    const server = createMockServer();
    vi.mocked(server.orchestrator.searchByImage).mockResolvedValue({ products: [], meta: {} } as never);
    vi.mocked(createCommerceAIServer).mockReturnValue(server);
    const handlers = createNextHandlers({} as never);
    const client = new AbortController();

    await handlers.searchSuggestions(
      new Request("http://localhost/search/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "red" }),
        signal: client.signal,
      }),
    );
    const form = new FormData();
    form.append("image", new File([new Uint8Array([0xff, 0xd8, 0xff])], "a.jpg", { type: "image/jpeg" }));
    await handlers.searchImage(
      new Request("http://localhost/search/image", { method: "POST", body: form, signal: client.signal }),
    );

    const suggestSignal = vi.mocked(server.orchestrator.suggestByText).mock.calls[0]?.[0].signal;
    const imageSignal = vi.mocked(server.orchestrator.searchByImage).mock.calls[0]?.[2]?.signal;
    expect(suggestSignal).toBeInstanceOf(AbortSignal);
    expect(imageSignal).toBeInstanceOf(AbortSignal);
    client.abort();
    expect(suggestSignal?.aborted).toBe(true);
    expect(imageSignal?.aborted).toBe(true);
  });

  it("health delegates to shared handlers", async () => {
    vi.mocked(createCommerceAIServer).mockReturnValue(createMockServer());

    const handlers = createNextHandlers({} as never);
    const response = await handlers.health();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("getCart uses shared cart actions", async () => {
    const server = createMockServer();
    vi.mocked(createCommerceAIServer).mockReturnValue(server);

    const handlers = createNextHandlers({} as never);
    const response = await handlers.getCart(
      new Request("http://localhost/cart", { headers: { [ANONYMOUS_ID_HEADER]: "anon-1" } }),
    );

    expect(server.commercetools.getCart).toHaveBeenCalledWith("anon-1", "en");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ cart: sampleCart });
  });

  it("getCart reads the session from the cart session header", async () => {
    const server = createMockServer();
    vi.mocked(createCommerceAIServer).mockReturnValue(server);

    const token = signCartSession({ customerId: "cust-1" }, "test-secret");
    const handlers = createNextHandlers({} as never);
    const response = await handlers.getCart(
      new Request("http://localhost/cart", {
        headers: { [CART_SESSION_HEADER]: token },
      }),
    );

    expect(server.commercetools.getCustomerCart).toHaveBeenCalledWith("cust-1", "en");
    expect(server.commercetools.getCart).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it("getCart ignores sessionToken in the query string", async () => {
    const server = createMockServer();
    vi.mocked(createCommerceAIServer).mockReturnValue(server);

    const token = signCartSession({ customerId: "cust-1" }, "test-secret");
    const handlers = createNextHandlers({} as never);
    const response = await handlers.getCart(
      new Request(`http://localhost/cart?sessionToken=${encodeURIComponent(token)}`),
    );

    expect(server.commercetools.getCustomerCart).not.toHaveBeenCalled();
    expect(response.status).toBe(400);
  });

  it("GET /orders reads anonymousId from the header", async () => {
    const server = createMockServer();
    vi.mocked(createCommerceAIServer).mockReturnValue(server);
    const handlers = createNextHandlers({} as never);

    const single = await handlers.getOrder(
      new Request("http://localhost/orders?orderNumber=cat-1", {
        headers: { [ANONYMOUS_ID_HEADER]: "anon-1" },
      }),
    );
    const list = await handlers.getOrder(
      new Request("http://localhost/orders?anonymousId=query-anon", {
        headers: { [ANONYMOUS_ID_HEADER]: "anon-1" },
      }),
    );
    const queryOnly = await handlers.getOrder(new Request("http://localhost/orders?anonymousId=query-anon"));

    expect(single.status).toBe(200);
    expect(list.status).toBe(200);
    expect(server.commercetools.getOrder).toHaveBeenCalledWith(
      expect.objectContaining({ orderNumber: "cat-1", anonymousId: "anon-1" }),
    );
    // The query parameter is not read: the header wins, and a request with only the query is rejected.
    expect(server.commercetools.listOrders).toHaveBeenCalledWith(
      expect.objectContaining({ anonymousId: "anon-1" }),
    );
    expect(queryOnly.status).toBe(400);
    expect(server.commercetools.listOrders).not.toHaveBeenCalledWith(
      expect.objectContaining({ anonymousId: "query-anon" }),
    );
  });

  it("cart, shipping and payment reads take anonymousId from the header", async () => {
    const server = createMockServer();
    vi.mocked(createCommerceAIServer).mockReturnValue(server);
    const handlers = createNextHandlers({} as never);
    const init = { headers: { [ANONYMOUS_ID_HEADER]: "anon-1" } };

    expect((await handlers.getCart(new Request("http://localhost/cart", init))).status).toBe(200);
    expect(
      (await handlers.getShippingMethods(new Request("http://localhost/cart/shipping-methods", init)))
        .status,
    ).toBe(200);
    expect(
      (await handlers.getPaymentMethods(new Request("http://localhost/cart/payment-methods", init)))
        .status,
    ).toBe(200);

    expect(server.commercetools.getCart).toHaveBeenCalledWith("anon-1", "en");
    expect(server.commercetools.getShippingMethods).toHaveBeenCalledWith(
      expect.objectContaining({ anonymousId: "anon-1" }),
    );
  });

  it("ignores the anonymousId query parameter", async () => {
    const server = createMockServer();
    vi.mocked(createCommerceAIServer).mockReturnValue(server);
    const handlers = createNextHandlers({} as never);

    const response = await handlers.getCart(new Request("http://localhost/cart?anonymousId=anon-1"));

    expect(response.status).toBe(400);
    expect(server.commercetools.getCart).not.toHaveBeenCalled();
  });

  it("rejects an oversized anonymous id header", async () => {
    const server = createMockServer();
    vi.mocked(createCommerceAIServer).mockReturnValue(server);
    const handlers = createNextHandlers({} as never);

    const response = await handlers.getCart(
      new Request("http://localhost/cart", { headers: { [ANONYMOUS_ID_HEADER]: "a".repeat(129) } }),
    );

    expect(response.status).toBe(400);
    expect(server.commercetools.getCart).not.toHaveBeenCalled();
  });

  it("addToCart uses shared cart actions", async () => {
    const server = createMockServer();
    vi.mocked(createCommerceAIServer).mockReturnValue(server);

    const handlers = createNextHandlers({} as never);
    const response = await handlers.addToCart(
      new Request("http://localhost/cart/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anonymousId: "anon-1", sku: "SHOE-RED" }),
      }),
    );

    expect(server.commercetools.addToCart).toHaveBeenCalledWith(
      expect.objectContaining({ anonymousId: "anon-1", sku: "SHOE-RED" }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ cart: sampleCart });
  });

  it("addItemsToCart uses shared cart actions", async () => {
    const server = createMockServer();
    vi.mocked(createCommerceAIServer).mockReturnValue(server);

    const handlers = createNextHandlers({} as never);
    const response = await handlers.addItemsToCart(
      new Request("http://localhost/cart/add-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anonymousId: "anon-1",
          items: [{ sku: "RACKET-1", quantity: 1 }],
        }),
      }),
    );

    expect(server.commercetools.addItemsToCart).toHaveBeenCalledWith(
      expect.objectContaining({
        anonymousId: "anon-1",
        items: [expect.objectContaining({ sku: "RACKET-1", quantity: 1 })],
      }),
    );
    expect(response.status).toBe(200);
  });

  it("login uses shared cart actions", async () => {
    const server = createMockServer();
    vi.mocked(server.commercetools.loginAndMerge).mockResolvedValue({
      customer: { id: "cust-1", email: "ada@example.com" },
      cart: sampleCart,
    });
    vi.mocked(createCommerceAIServer).mockReturnValue(server);

    const handlers = createNextHandlers({} as never);
    const response = await handlers.login(
      new Request("http://localhost/cart/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "ada@example.com", password: "secret" }),
      }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { customer: { id: string }; sessionToken: string };
    expect(body.customer.id).toBe("cust-1");
    expect(body.sessionToken).toEqual(expect.any(String));
  });

  it("logout passes the cart session header to onLogout", async () => {
    const onLogout = vi.fn();
    const server = { ...createMockServer(), cartSessionHooks: { onLogout } };
    vi.mocked(createCommerceAIServer).mockReturnValue(server);
    const token = signCartSession({ customerId: "cust-1" }, "test-secret");

    const handlers = createNextHandlers({} as never);
    const response = await handlers.logout(
      new Request("http://localhost/cart/logout", {
        method: "POST",
        headers: { [CART_SESSION_HEADER]: token },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ cart: null, customer: null });
    expect(onLogout).toHaveBeenCalledWith(expect.objectContaining({ customerId: "cust-1" }));
  });

  it("logout without a request or token still returns 200 and skips onLogout", async () => {
    const onLogout = vi.fn();
    const server = { ...createMockServer(), cartSessionHooks: { onLogout } };
    vi.mocked(createCommerceAIServer).mockReturnValue(server);

    const handlers = createNextHandlers({} as never);
    const bare = await handlers.logout();
    const invalid = await handlers.logout(
      new Request("http://localhost/cart/logout", {
        method: "POST",
        headers: { [CART_SESSION_HEADER]: "forged.token" },
      }),
    );

    expect([bare.status, invalid.status]).toEqual([200, 200]);
    await expect(invalid.json()).resolves.toEqual({ cart: null, customer: null });
    expect(onLogout).not.toHaveBeenCalled();
  });
});

function jsonPost(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("createNextHandlers rate limits and content type", () => {
  afterEach(() => {
    vi.mocked(createCommerceAIServer).mockReset();
    vi.restoreAllMocks();
  });

  function setup(options?: NextHandlerOptions) {
    const server = createMockServer();
    vi.mocked(createCommerceAIServer).mockReturnValue(server);
    return { server, handlers: createNextHandlers({} as never, options) };
  }

  it("returns 429 RATE_LIMITED on the 31st search within a minute", async () => {
    const { server, handlers } = setup();

    for (let i = 0; i < 30; i += 1) {
      const ok = await handlers.search(jsonPost("/search", { query: "hat" }, { "x-real-ip": "203.0.113.5" }));
      expect(ok.status).toBe(200);
    }

    const limited = await handlers.search(
      jsonPost("/search", { query: "hat" }, { "x-real-ip": "203.0.113.5" }),
    );

    expect(limited.status).toBe(429);
    await expect(limited.json()).resolves.toEqual({
      error: AI_RATE_LIMIT_MESSAGE,
      code: "RATE_LIMITED",
    });
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(server.orchestrator.searchByText).toHaveBeenCalledTimes(30);
  });

  it("shares the AI bucket across search, voice, image and tts", async () => {
    const { server, handlers } = setup({ aiRateLimit: { limit: 2 } });

    expect((await handlers.search(jsonPost("/search", { query: "hat" }))).status).toBe(200);
    expect((await handlers.tts(jsonPost("/tts", { text: "hello" }))).status).toBe(200);

    const voice = await handlers.searchVoice(
      new Request("http://localhost/search/voice", { method: "POST", body: new FormData() }),
    );
    const image = await handlers.searchImage(
      new Request("http://localhost/search/image", { method: "POST", body: new FormData() }),
    );
    const tts = await handlers.tts(jsonPost("/tts", { text: "hello" }));

    expect(voice.status).toBe(429);
    expect(image.status).toBe(429);
    expect(tts.status).toBe(429);
    expect(server.synthesizeSpeech).toHaveBeenCalledTimes(1);
  });

  it("limits suggestions in a separate 120/min bucket", async () => {
    const { handlers } = setup({ aiRateLimit: { limit: 1 } });

    expect((await handlers.search(jsonPost("/search", { query: "hat" }))).status).toBe(200);
    expect((await handlers.search(jsonPost("/search", { query: "hat" }))).status).toBe(429);

    for (let i = 0; i < 120; i += 1) {
      const ok = await handlers.searchSuggestions(jsonPost("/search/suggestions", { query: "red" }));
      expect(ok.status).toBe(200);
    }
    const limited = await handlers.searchSuggestions(jsonPost("/search/suggestions", { query: "red" }));
    expect(limited.status).toBe(429);
    await expect(limited.json()).resolves.toEqual({
      error: AI_RATE_LIMIT_MESSAGE,
      code: "RATE_LIMITED",
    });
  });

  it("applies suggestionsRateLimit independently of aiRateLimit", async () => {
    const { handlers } = setup({ aiRateLimit: { limit: 100 }, suggestionsRateLimit: { limit: 1 } });

    expect((await handlers.searchSuggestions(jsonPost("/search/suggestions", { query: "red" }))).status).toBe(200);
    const limited = await handlers.searchSuggestions(jsonPost("/search/suggestions", { query: "red" }));
    expect(limited.status).toBe(429);
    expect((await handlers.search(jsonPost("/search", { query: "hat" }))).status).toBe(200);
  });

  it("suggestionsRateLimit: false disables only the suggestions limiter", async () => {
    const { handlers } = setup({ aiRateLimit: { limit: 1 }, suggestionsRateLimit: false });

    for (let i = 0; i < 125; i += 1) {
      expect((await handlers.searchSuggestions(jsonPost("/search/suggestions", { query: "red" }))).status).toBe(200);
    }
  });

  it("search rejects malformed searchTerms with 400 VALIDATION", async () => {
    const { server, handlers } = setup();

    for (const searchTerms of [[1], "red shoes", Array.from({ length: 21 }, () => "x")]) {
      const response = await handlers.search(jsonPost("/search", { query: "hat", searchTerms }));
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ code: "VALIDATION" });
    }
    expect(server.orchestrator.searchByText).not.toHaveBeenCalled();
  });

  it("aiRateLimit: false disables the AI and suggestions limiters", async () => {
    const { handlers } = setup({ aiRateLimit: false });

    for (let i = 0; i < 40; i += 1) {
      expect((await handlers.search(jsonPost("/search", { query: "hat" }))).status).toBe(200);
    }
  });

  it("uses options.clientKey when provided", async () => {
    const clientKey = vi.fn(() => "tenant-a");
    const { handlers } = setup({ clientKey, aiRateLimit: { limit: 1 } });

    const first = await handlers.search(
      jsonPost("/search", { query: "hat" }, { "x-forwarded-for": "198.51.100.1" }),
    );
    const second = await handlers.search(
      jsonPost("/search", { query: "hat" }, { "x-forwarded-for": "198.51.100.2" }),
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(clientKey).toHaveBeenCalledWith(expect.any(Request));
  });

  it("keys the default limiter on the right-most X-Forwarded-For entry", async () => {
    const { handlers } = setup({ aiRateLimit: { limit: 1 } });

    const first = await handlers.search(
      jsonPost("/search", { query: "hat" }, { "x-forwarded-for": "10.0.0.1, 203.0.113.9" }),
    );
    // A spoofed left-most entry does not change the key.
    const second = await handlers.search(
      jsonPost("/search", { query: "hat" }, { "x-forwarded-for": "10.0.0.2, 203.0.113.9" }),
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
  });

  it("gives each createNextHandlers call its own limiters", async () => {
    const a = setup({ aiRateLimit: { limit: 1 } }).handlers;
    const b = setup({ aiRateLimit: { limit: 1 } }).handlers;

    expect((await a.search(jsonPost("/search", { query: "hat" }))).status).toBe(200);
    expect((await b.search(jsonPost("/search", { query: "hat" }))).status).toBe(200);
    expect((await a.search(jsonPost("/search", { query: "hat" }))).status).toBe(429);
  });

  it("login is limited per email hash even when client keys rotate", async () => {
    const { server, handlers } = setup();
    vi.mocked(server.commercetools.loginAndMerge).mockRejectedValue(new InvalidCredentialsError());

    for (let i = 0; i < 10; i += 1) {
      const attempt = await handlers.login(
        jsonPost(
          "/cart/login",
          { email: i % 2 === 0 ? "ada@example.com" : " ADA@example.com ", password: "wrong" },
          { "x-forwarded-for": `198.51.100.${i}` },
        ),
      );
      expect(attempt.status).toBe(401);
    }

    const limited = await handlers.login(
      jsonPost(
        "/cart/login",
        { email: "ada@example.com", password: "wrong" },
        { "x-forwarded-for": "198.51.100.200" },
      ),
    );

    expect(limited.status).toBe(429);
    await expect(limited.json()).resolves.toEqual({
      error: LOGIN_RATE_LIMIT_MESSAGE,
      code: "RATE_LIMITED",
    });
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(server.commercetools.loginAndMerge).toHaveBeenCalledTimes(10);

    // A different email from a fresh client key is not affected.
    const other = await handlers.login(
      jsonPost(
        "/cart/login",
        { email: "grace@example.com", password: "wrong" },
        { "x-forwarded-for": "198.51.100.201" },
      ),
    );
    expect(other.status).toBe(401);
  });

  it("successful logins do not consume the email bucket", async () => {
    const { server, handlers } = setup();
    vi.mocked(server.commercetools.loginAndMerge).mockResolvedValue({
      customer: { id: "cust-1", email: "ada@example.com" },
      cart: sampleCart,
    });

    for (let i = 0; i < 15; i += 1) {
      const ok = await handlers.login(
        jsonPost(
          "/cart/login",
          { email: "ada@example.com", password: "right" },
          { "x-forwarded-for": `198.51.100.${i}` },
        ),
      );
      expect(ok.status).toBe(200);
    }
  });

  it("10 failed logins for one email block the 11th attempt even with the correct password", async () => {
    const { server, handlers } = setup();
    vi.mocked(server.commercetools.loginAndMerge).mockRejectedValue(new InvalidCredentialsError());

    for (let i = 0; i < 10; i += 1) {
      const failed = await handlers.login(
        jsonPost(
          "/cart/login",
          { email: "ada@example.com", password: "wrong" },
          { "x-forwarded-for": `198.51.100.${i}` },
        ),
      );
      expect(failed.status).toBe(401);
    }

    vi.mocked(server.commercetools.loginAndMerge).mockResolvedValue({
      customer: { id: "cust-1", email: "ada@example.com" },
      cart: sampleCart,
    });
    const blocked = await handlers.login(
      jsonPost(
        "/cart/login",
        { email: "ada@example.com", password: "right" },
        { "x-forwarded-for": "198.51.100.99" },
      ),
    );

    expect(blocked.status).toBe(429);
    await expect(blocked.json()).resolves.toEqual({
      error: LOGIN_RATE_LIMIT_MESSAGE,
      code: "RATE_LIMITED",
    });
    expect(server.commercetools.loginAndMerge).toHaveBeenCalledTimes(10);
  });

  it("parallel failed logins never exceed the limit", async () => {
    const { server, handlers } = setup();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.mocked(server.commercetools.loginAndMerge).mockImplementation(async () => {
      await gate;
      throw new InvalidCredentialsError();
    });

    const attempts = Array.from({ length: 15 }, (_, i) =>
      handlers.login(
        jsonPost(
          "/cart/login",
          { email: "ada@example.com", password: "wrong" },
          { "x-forwarded-for": `198.51.100.${i}` },
        ),
      ),
    );
    // Let every request reach the limiter before any login settles.
    await new Promise((resolve) => setTimeout(resolve, 20));
    release();
    const statuses = (await Promise.all(attempts)).map((response) => response.status);

    expect(server.commercetools.loginAndMerge).toHaveBeenCalledTimes(10);
    expect(statuses.filter((status) => status === 401)).toHaveLength(10);
    expect(statuses.filter((status) => status === 429)).toHaveLength(5);
  });

  it("a 5xx from loginAndMerge does not consume the email bucket", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { server, handlers } = setup();
    vi.mocked(server.commercetools.loginAndMerge).mockRejectedValue(new Error("upstream 503"));

    for (let i = 0; i < 12; i += 1) {
      const failed = await handlers.login(
        jsonPost(
          "/cart/login",
          { email: "ada@example.com", password: "right" },
          { "x-forwarded-for": `198.51.100.${i}` },
        ),
      );
      expect(failed.status).toBe(500);
    }

    vi.mocked(server.commercetools.loginAndMerge).mockResolvedValue({
      customer: { id: "cust-1", email: "ada@example.com" },
      cart: sampleCart,
    });
    const ok = await handlers.login(
      jsonPost(
        "/cart/login",
        { email: "ada@example.com", password: "right" },
        { "x-forwarded-for": "198.51.100.99" },
      ),
    );
    expect(ok.status).toBe(200);
  });

  it("a different email is unaffected by another email's failures", async () => {
    const { server, handlers } = setup();
    vi.mocked(server.commercetools.loginAndMerge).mockRejectedValue(new InvalidCredentialsError());

    for (let i = 0; i < 10; i += 1) {
      await handlers.login(
        jsonPost(
          "/cart/login",
          { email: "ada@example.com", password: "wrong" },
          { "x-forwarded-for": `198.51.100.${i}` },
        ),
      );
    }

    vi.mocked(server.commercetools.loginAndMerge).mockResolvedValue({
      customer: { id: "cust-2", email: "grace@example.com" },
      cart: sampleCart,
    });
    const other = await handlers.login(
      jsonPost(
        "/cart/login",
        { email: "grace@example.com", password: "right" },
        { "x-forwarded-for": "198.51.100.50" },
      ),
    );
    expect(other.status).toBe(200);
  });

  it("login is limited per client key across emails", async () => {
    const { server, handlers } = setup({ loginRateLimit: { limit: 2 } });
    vi.mocked(server.commercetools.loginAndMerge).mockRejectedValue(new InvalidCredentialsError());

    for (const email of ["a@example.com", "b@example.com"]) {
      expect((await handlers.login(jsonPost("/cart/login", { email, password: "x" }))).status).toBe(401);
    }
    const limited = await handlers.login(
      jsonPost("/cart/login", { email: "c@example.com", password: "x" }),
    );

    expect(limited.status).toBe(429);
    await expect(limited.json()).resolves.toEqual({
      error: LOGIN_RATE_LIMIT_MESSAGE,
      code: "RATE_LIMITED",
    });
    expect(limited.headers.get("Retry-After")).toBe("900");
  });

  it("returns a typed 429 with Retry-After for order and payment", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { handlers } = setup({
      orderRateLimit: { limit: 1, windowMs: 60_000 },
      paymentRateLimit: { limit: 1, windowMs: 60_000 },
    });

    await handlers.createOrder(jsonPost("/cart/order", {}));
    const order = await handlers.createOrder(jsonPost("/cart/order", {}));
    expect(order.status).toBe(429);
    await expect(order.json()).resolves.toEqual({
      error: ORDER_RATE_LIMIT_MESSAGE,
      code: "RATE_LIMITED",
    });
    expect(order.headers.get("Retry-After")).toBe("60");

    await handlers.authorizePayment(jsonPost("/cart/payment", {}));
    const payment = await handlers.authorizePayment(jsonPost("/cart/payment", {}));
    expect(payment.status).toBe(429);
    await expect(payment.json()).resolves.toEqual({
      error: PAYMENT_RATE_LIMIT_MESSAGE,
      code: "RATE_LIMITED",
    });
    expect(payment.headers.get("Retry-After")).toBe("60");
  });

  it("rejects a JSON route with Content-Type text/plain with 415", async () => {
    const { server, handlers } = setup();

    const response = await handlers.search(
      new Request("http://localhost/search", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ query: "hat" }),
      }),
    );

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({
      error: "Content-Type must be application/json",
      code: "UNSUPPORTED_MEDIA_TYPE",
    });
    expect(server.orchestrator.searchByText).not.toHaveBeenCalled();
  });

  it("rejects cart, login and tts bodies without a JSON Content-Type", async () => {
    const { server, handlers } = setup();
    const plain = (path: string, body: unknown) =>
      new Request(`http://localhost${path}`, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(body),
      });

    expect((await handlers.tts(plain("/tts", { text: "hi" }))).status).toBe(415);
    expect(
      (await handlers.addToCart(plain("/cart/add", { anonymousId: "anon-1", sku: "S" }))).status,
    ).toBe(415);
    expect(
      (await handlers.login(plain("/cart/login", { email: "ada@example.com", password: "x" }))).status,
    ).toBe(415);
    expect(server.commercetools.addToCart).not.toHaveBeenCalled();
    expect(server.commercetools.loginAndMerge).not.toHaveBeenCalled();
  });

  it("accepts application/json; charset=utf-8", async () => {
    const { handlers } = setup();

    const response = await handlers.search(
      new Request("http://localhost/search", {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ query: "hat" }),
      }),
    );

    expect(response.status).toBe(200);
  });
});

describe("createNextHandlers upload and body limits", () => {
  afterEach(() => {
    vi.mocked(createCommerceAIServer).mockReset();
    vi.restoreAllMocks();
  });

  function setup() {
    const server = createMockServer();
    vi.mocked(createCommerceAIServer).mockReturnValue(server);
    return { server, handlers: createNextHandlers({} as never) };
  }

  function upload(path: string, field: string, type: string, bytes: number): Request {
    const form = new FormData();
    form.append(field, new File([new Uint8Array(bytes)], "upload.bin", { type }));
    return new Request(`http://localhost${path}`, { method: "POST", body: form });
  }

  it("413 for an image over MAX_IMAGE_BYTES", async () => {
    const { server, handlers } = setup();

    const response = await handlers.searchImage(
      upload("/search/image", "image", "image/jpeg", MAX_IMAGE_BYTES + 1),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
    expect(server.orchestrator.searchByImage).not.toHaveBeenCalled();
  });

  it("415 for image/gif and for an unsupported audio type", async () => {
    const { server, handlers } = setup();

    const image = await handlers.searchImage(upload("/search/image", "image", "image/gif", 16));
    const audio = await handlers.searchVoice(upload("/search/voice", "audio", "text/plain", 16));
    const oversizedAudio = await handlers.searchVoice(
      upload("/search/voice", "audio", "audio/webm", MAX_AUDIO_BYTES + 1),
    );

    expect(image.status).toBe(415);
    expect(audio.status).toBe(415);
    expect(oversizedAudio.status).toBe(413);
    expect(server.orchestrator.searchByImage).not.toHaveBeenCalled();
    expect(server.orchestrator.searchByVoice).not.toHaveBeenCalled();
  });

  it("413 for a JSON body over 64 KB", async () => {
    const { server, handlers } = setup();

    const response = await handlers.search(
      jsonPost("/search", { query: "hat", padding: "x".repeat(MAX_JSON_BODY_BYTES) }),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
    expect(server.orchestrator.searchByText).not.toHaveBeenCalled();
  });

  it("voice error context logs normalised locales, never the raw client values", async () => {
    vi.stubEnv("CAT_DEBUG", "true");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { server, handlers } = setup();
    vi.mocked(server.orchestrator.searchByVoice).mockRejectedValue(new Error("boom"));
    const form = new FormData();
    form.append("audio", new File([new Uint8Array(16)], "upload.bin", { type: "audio/webm" }));
    form.append("queryLocale", "<script>raw-query-locale</script>");
    form.append("catalogLocale", "raw catalog locale");

    const response = await handlers.searchVoice(
      new Request("http://localhost/search/voice", { method: "POST", body: form }),
    );

    expect(response.status).toBe(500);
    const logged = JSON.stringify(errorSpy.mock.calls);
    expect(logged).toContain("context");
    expect(logged).not.toContain("raw-query-locale");
    expect(logged).not.toContain("raw catalog locale");
    vi.unstubAllEnvs();
  });

  it("503 when voice search has no STT backend", async () => {
    const { server, handlers } = setup();
    vi.mocked(server.orchestrator.searchByVoice).mockRejectedValue(new VoiceNotConfiguredError());

    const response = await handlers.searchVoice(upload("/search/voice", "audio", "audio/webm", 16));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Voice service is not configured",
      code: "UPSTREAM_UNAVAILABLE",
    });
  });
});

describe("createNextHandlers Langfuse flush defer", () => {
  afterEach(() => {
    vi.mocked(createCommerceAIServer).mockReset();
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    registerLangfuseFlush(null);
    vi.restoreAllMocks();
  });

  function post(path: string, body: unknown): Request {
    return new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("uses options.defer for the flush and does not flush inline", async () => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk";
    process.env.LANGFUSE_SECRET_KEY = "sk";
    vi.mocked(createCommerceAIServer).mockReturnValue(createMockServer());
    const flush = vi.fn().mockResolvedValue(undefined);
    registerLangfuseFlush(flush);
    const defer = vi.fn();

    const handlers = createNextHandlers({} as never, { defer });
    const search = await handlers.search(post("/search", { query: "hat" }));
    const tts = await handlers.tts(post("/tts", { text: "hello" }));

    expect(search.status).toBe(200);
    expect(tts.status).toBe(200);
    expect(defer).toHaveBeenCalledTimes(2);
    expect(flush).not.toHaveBeenCalled();
    await defer.mock.calls[0]![0]();
    expect(flush).toHaveBeenCalledOnce();
  });

  it("flushes detached when no defer is given and a failing flush does not fail the request", async () => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk";
    process.env.LANGFUSE_SECRET_KEY = "sk";
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.mocked(createCommerceAIServer).mockReturnValue(createMockServer());
    const flush = vi.fn().mockRejectedValue(new Error("Timeout"));
    registerLangfuseFlush(flush);

    const handlers = createNextHandlers({} as never);
    const response = await handlers.search(post("/search", { query: "hat" }));

    expect(response.status).toBe(200);
    await vi.waitFor(() => expect(flush).toHaveBeenCalledOnce());
  });
});
