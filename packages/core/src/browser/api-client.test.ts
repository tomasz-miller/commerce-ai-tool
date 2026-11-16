import { describe, expect, it, vi } from "vitest";
import {
  ANONYMOUS_ID_HEADER,
  CART_SESSION_HEADER,
} from "../config/defaults.js";
import { CommerceAIApiError, createCommerceAIApiClient } from "./api-client.js";

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function setup(
  respond: () => Response | Promise<Response> = () => jsonResponse({}),
  options: { getSessionToken?: () => string | null; getAnonymousId?: () => string | null } = {},
) {
  const fetchMock: FetchMock = vi.fn<typeof fetch>(async () => respond());
  const client = createCommerceAIApiClient({
    baseUrl: "https://shop.example.com/api/commerce-ai/",
    fetch: fetchMock,
    ...options,
  });
  return { client, fetchMock };
}

function lastCall(fetchMock: FetchMock): { url: string; init: RequestInit } {
  const [url, init] = fetchMock.mock.calls.at(-1)!;
  return { url: String(url), init: init ?? {} };
}

function lastJsonBody(fetchMock: FetchMock): Record<string, unknown> {
  return JSON.parse(String(lastCall(fetchMock).init.body)) as Record<string, unknown>;
}

describe("error handling", () => {
  it("throws CommerceAIApiError with code RATE_LIMITED on 429", async () => {
    const { client } = setup(() =>
      jsonResponse({ error: "The AI service is busy", code: "RATE_LIMITED", requestId: "req-1" }, 429),
    );

    const error = await client.search({ query: "shoes" }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CommerceAIApiError);
    expect(error).toMatchObject({
      name: "CommerceAIApiError",
      status: 429,
      code: "RATE_LIMITED",
      message: "The AI service is busy",
      requestId: "req-1",
    });
  });

  it("non-JSON error body yields code INTERNAL", async () => {
    const { client } = setup(
      () => new Response("<html>Bad Gateway</html>", { status: 502, headers: { "Content-Type": "text/html" } }),
    );

    const error = await client.search({ query: "shoes" }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CommerceAIApiError);
    expect(error).toMatchObject({ status: 502, code: "INTERNAL" });
    expect((error as Error).message).not.toContain("Unexpected token");
  });

  it("maps an unknown or missing code in a JSON error body to INTERNAL", async () => {
    const unknownCode = setup(() => jsonResponse({ error: "x", code: "SOMETHING_NEW" }, 400));
    await expect(unknownCode.client.search({ query: "q" })).rejects.toMatchObject({ code: "INTERNAL" });

    const noCode = setup(() => jsonResponse({ error: "x" }, 400));
    await expect(noCode.client.search({ query: "q" })).rejects.toMatchObject({
      status: 400,
      code: "INTERNAL",
      message: "x",
    });
  });

  it("treats a 2xx response with a non-JSON body as an INTERNAL error", async () => {
    const { client } = setup(() => new Response("<html></html>", { status: 200 }));

    await expect(client.search({ query: "q" })).rejects.toMatchObject({ status: 200, code: "INTERNAL" });
  });

  it("does not wrap an abort: the AbortError reaches the caller", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn<typeof fetch>((_url, init) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      });
    });
    const client = createCommerceAIApiClient({ baseUrl: "/api", fetch: fetchMock });

    const pending = client.search({ query: "q" }, { signal: controller.signal });
    controller.abort(new DOMException("aborted", "AbortError"));

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("cancellation and timeouts", () => {
  /** A response whose body read rejects with `reason`. */
  function failingBody(status: number, reason: unknown): Response {
    const response = new Response("{}", { status });
    vi.spyOn(response, "json").mockRejectedValue(reason);
    return response;
  }

  it("rethrows a TimeoutError from fetch (AbortSignal.timeout) unwrapped", async () => {
    const timeout = new DOMException("The operation timed out", "TimeoutError");
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(timeout);
    const client = createCommerceAIApiClient({ baseUrl: "/api", fetch: fetchMock });

    await expect(client.search({ query: "q" }, { signal: AbortSignal.timeout(60_000) })).rejects.toBe(timeout);
  });

  it("rethrows a TimeoutError raised while reading a success body", async () => {
    const timeout = new DOMException("The operation timed out", "TimeoutError");
    const { client } = setup(() => failingBody(200, timeout));

    await expect(client.search({ query: "q" })).rejects.toBe(timeout);
  });

  it("rethrows a TimeoutError raised while reading an error body", async () => {
    const timeout = new DOMException("The operation timed out", "TimeoutError");
    const { client } = setup(() => failingBody(502, timeout));

    await expect(client.search({ query: "q" })).rejects.toBe(timeout);
  });

  it("rethrows whatever the body read failed with once the signal has aborted", async () => {
    const controller = new AbortController();
    const reason = new TypeError("terminated");
    const { client } = setup(() => {
      controller.abort();
      return failingBody(200, reason);
    });

    await expect(client.search({ query: "q" }, { signal: controller.signal })).rejects.toBe(reason);
  });

  it("still maps an unreadable body to INTERNAL when nothing was cancelled", async () => {
    const { client } = setup(() => failingBody(200, new SyntaxError("Unexpected token <")));

    await expect(client.search({ query: "q" })).rejects.toMatchObject({ code: "INTERNAL" });
  });
});

describe("search routes", () => {
  it("POSTs the typed body to /search and forwards the abort signal", async () => {
    const { client, fetchMock } = setup(() => jsonResponse({ products: [] }));
    const controller = new AbortController();

    const result = await client.search(
      { query: "shoes", widgetSessionId: "w-1", facetSelections: { categories: ["c1"] } },
      { signal: controller.signal },
    );

    const { url, init } = lastCall(fetchMock);
    expect(url).toBe("https://shop.example.com/api/commerce-ai/search");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
    expect(init.signal).toBe(controller.signal);
    expect(lastJsonBody(fetchMock)).toEqual({
      query: "shoes",
      widgetSessionId: "w-1",
      facetSelections: { categories: ["c1"] },
    });
    expect(result).toEqual({ products: [] });
  });

  it("POSTs suggestions to /search/suggestions", async () => {
    const { client, fetchMock } = setup(() => jsonResponse({ suggestions: [] }));

    await client.suggest({ query: "sho", limit: 5 });

    expect(lastCall(fetchMock).url).toBe("https://shop.example.com/api/commerce-ai/search/suggestions");
    expect(lastJsonBody(fetchMock)).toEqual({ query: "sho", limit: 5 });
  });

  it("GETs the facet schema", async () => {
    const { client, fetchMock } = setup(() => jsonResponse({ attributes: [] }));

    await client.facetSchema();

    const { url, init } = lastCall(fetchMock);
    expect(url).toBe("https://shop.example.com/api/commerce-ai/search/facet-schema");
    expect(init.method ?? "GET").toBe("GET");
  });

  it("uploads a voice recording as multipart with the recorder's container", async () => {
    const { client, fetchMock } = setup(() => jsonResponse({ transcript: "shoes", ttsPending: false }));

    await client.searchByVoice(
      new Blob(["voice"], { type: "audio/mp4" }),
      { queryLocale: "en-US", enableTts: "false", enableMissions: "true", widgetSessionId: "w-1" },
    );

    const { url, init } = lastCall(fetchMock);
    expect(url).toBe("https://shop.example.com/api/commerce-ai/search/voice");
    expect(init.method).toBe("POST");
    const form = init.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    const audio = form.get("audio") as File;
    expect(audio.name).toBe("recording.m4a");
    expect(audio.type).toBe("audio/mp4");
    expect(form.get("queryLocale")).toBe("en-US");
    expect(form.get("enableTts")).toBe("false");
    expect(form.get("enableMissions")).toBe("true");
    expect(form.get("widgetSessionId")).toBe("w-1");
    // The browser sets the multipart boundary: no manual Content-Type.
    expect(new Headers(init.headers).has("Content-Type")).toBe(false);
  });

  it("skips undefined multipart fields", async () => {
    const { client, fetchMock } = setup(() => jsonResponse({ products: [] }));

    await client.searchByImage(new File(["img"], "photo.jpg", { type: "image/jpeg" }), {
      catalogLocale: undefined,
      enableMissions: "true",
    });

    const form = lastCall(fetchMock).init.body as FormData;
    expect(lastCall(fetchMock).url).toBe("https://shop.example.com/api/commerce-ai/search/image");
    expect((form.get("image") as File).name).toBe("photo.jpg");
    expect(form.has("catalogLocale")).toBe(false);
    expect(form.get("enableMissions")).toBe("true");
  });

  it("returns the TTS audio as a Blob", async () => {
    const { client, fetchMock } = setup(
      () => new Response(new Blob(["mp3"], { type: "audio/mpeg" }), { status: 200 }),
    );

    const blob = await client.tts({ text: "hello" });

    expect(await blob.text()).toBe("mp3");
    expect(lastCall(fetchMock).url).toBe("https://shop.example.com/api/commerce-ai/tts");
    expect(lastJsonBody(fetchMock)).toEqual({ text: "hello" });
  });

  it("throws a CommerceAIApiError for a failed TTS request", async () => {
    const { client } = setup(() => jsonResponse({ error: "busy", code: "RATE_LIMITED" }, 429));

    await expect(client.tts({ text: "hello" })).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});

describe("cart routes", () => {
  it("reads the cart with the guest id header and never in the URL", async () => {
    const { client, fetchMock } = setup(() => jsonResponse({ cart: null }), {
      getAnonymousId: () => "guest-1",
      getSessionToken: () => null,
    });

    await client.cart.get({ catalogLocale: "en-US" });

    const { url, init } = lastCall(fetchMock);
    expect(url).toBe("https://shop.example.com/api/commerce-ai/cart?catalogLocale=en-US");
    expect(url).not.toContain("guest-1");
    const headers = new Headers(init.headers);
    expect(headers.get(ANONYMOUS_ID_HEADER)).toBe("guest-1");
    expect(headers.has(CART_SESSION_HEADER)).toBe(false);
  });

  it("prefers the session token header over the guest id for reads", async () => {
    const { client, fetchMock } = setup(() => jsonResponse({ cart: null }), {
      getAnonymousId: () => "guest-1",
      getSessionToken: () => "token-abc",
    });

    await client.cart.get({});

    const { url, init } = lastCall(fetchMock);
    expect(url).toBe("https://shop.example.com/api/commerce-ai/cart");
    expect(url).not.toContain("token-abc");
    const headers = new Headers(init.headers);
    expect(headers.get(CART_SESSION_HEADER)).toBe("token-abc");
    expect(headers.has(ANONYMOUS_ID_HEADER)).toBe(false);
  });

  it("adds identity to mutation bodies and lets the caller's fields through", async () => {
    const { client, fetchMock } = setup(() => jsonResponse({ cart: null }), {
      getAnonymousId: () => "guest-1",
      getSessionToken: () => "token-abc",
    });

    await client.cart.add({ sku: "SKU-1", quantity: 2, cartId: "cart-1", currency: "EUR" });

    expect(lastCall(fetchMock).url).toBe("https://shop.example.com/api/commerce-ai/cart/add");
    expect(lastJsonBody(fetchMock)).toEqual({
      anonymousId: "guest-1",
      sessionToken: "token-abc",
      sku: "SKU-1",
      quantity: 2,
      cartId: "cart-1",
      currency: "EUR",
    });
  });

  it("omits identity fields that are not set", async () => {
    const { client, fetchMock } = setup(() => jsonResponse({ cart: null }));

    await client.cart.remove({ lineItemId: "li-1" });

    expect(lastCall(fetchMock).url).toBe("https://shop.example.com/api/commerce-ai/cart/remove");
    expect(lastJsonBody(fetchMock)).toEqual({ lineItemId: "li-1" });
  });

  it("maps every cart mutation to its route", async () => {
    const { client, fetchMock } = setup(() => jsonResponse({ cart: null }), {
      getAnonymousId: () => "guest-1",
    });
    const address = {
      firstName: "A",
      lastName: "B",
      streetName: "Main",
      postalCode: "1",
      city: "C",
      country: "DE",
    };

    await client.cart.addItems({ items: [{ sku: "A" }] });
    expect(lastCall(fetchMock).url).toMatch(/\/cart\/add-items$/);
    await client.cart.updateQuantity({ lineItemId: "li", quantity: 3 });
    expect(lastCall(fetchMock).url).toMatch(/\/cart\/update-quantity$/);
    await client.cart.addresses({ shippingAddress: address });
    expect(lastCall(fetchMock).url).toMatch(/\/cart\/addresses$/);
    await client.cart.setShippingMethod({ shippingMethodId: "sm" });
    expect(lastCall(fetchMock).url).toMatch(/\/cart\/shipping-method$/);
    await client.cart.pay({ method: "card", cartId: "c1", orderNumber: "cat-1" });
    expect(lastCall(fetchMock).url).toMatch(/\/cart\/payment$/);
    await client.cart.order({ cartId: "c1", orderNumber: "cat-1" });
    expect(lastCall(fetchMock).url).toMatch(/\/cart\/order$/);
    expect(lastJsonBody(fetchMock)).toEqual({ anonymousId: "guest-1", cartId: "c1", orderNumber: "cat-1" });
  });

  it("reads shipping and payment methods with query parameters and identity headers", async () => {
    const { client, fetchMock } = setup(() => jsonResponse({ shippingMethods: [] }), {
      getSessionToken: () => "token-abc",
    });

    await client.cart.shippingMethods({ cartId: "c1", catalogLocale: "en-US" });
    expect(lastCall(fetchMock).url).toBe(
      "https://shop.example.com/api/commerce-ai/cart/shipping-methods?cartId=c1&catalogLocale=en-US",
    );
    expect(new Headers(lastCall(fetchMock).init.headers).get(CART_SESSION_HEADER)).toBe("token-abc");

    await client.cart.paymentMethods({ cartId: "c1" });
    expect(lastCall(fetchMock).url).toBe(
      "https://shop.example.com/api/commerce-ai/cart/payment-methods?cartId=c1",
    );
  });

  it("sends the guest id (never the session token) on login", async () => {
    const { client, fetchMock } = setup(() => jsonResponse({ cart: null, customer: null }), {
      getAnonymousId: () => "guest-1",
      getSessionToken: () => "stale-token",
    });

    await client.cart.login({ email: "shopper@example.test", password: "pw", cartId: "c1" });

    expect(lastCall(fetchMock).url).toBe("https://shop.example.com/api/commerce-ai/cart/login");
    expect(lastJsonBody(fetchMock)).toEqual({
      email: "shopper@example.test",
      password: "pw",
      anonymousId: "guest-1",
      cartId: "c1",
    });
  });

  it("sends the session token header and an empty body on logout", async () => {
    const { client, fetchMock } = setup(() => jsonResponse({ cart: null, customer: null }), {
      getSessionToken: () => "token-abc",
    });

    await client.cart.logout();

    const { url, init } = lastCall(fetchMock);
    expect(url).toBe("https://shop.example.com/api/commerce-ai/cart/logout");
    expect(new Headers(init.headers).get(CART_SESSION_HEADER)).toBe("token-abc");
    expect(init.body).toBe("{}");
  });

  it("sends no session header on logout without a token", async () => {
    const { client, fetchMock } = setup(() => jsonResponse({ cart: null, customer: null }));

    await client.cart.logout();

    expect(new Headers(lastCall(fetchMock).init.headers).has(CART_SESSION_HEADER)).toBe(false);
  });

  it("surfaces a 401 SESSION_INVALID so the store can rotate the guest id", async () => {
    const { client } = setup(() => jsonResponse({ error: "Invalid cart session", code: "SESSION_INVALID" }, 401), {
      getSessionToken: () => "token-abc",
    });

    await expect(client.cart.get({})).rejects.toMatchObject({ status: 401, code: "SESSION_INVALID" });
  });
});

describe("orders routes", () => {
  it("reads one order by number with identity headers", async () => {
    const { client, fetchMock } = setup(() => jsonResponse({ order: { id: "o1" } }), {
      getAnonymousId: () => "guest-1",
    });

    await client.orders.get({ orderNumber: "cat-1", catalogLocale: "en-US" });

    const { url, init } = lastCall(fetchMock);
    expect(url).toBe("https://shop.example.com/api/commerce-ai/orders?orderNumber=cat-1&catalogLocale=en-US");
    expect(new Headers(init.headers).get(ANONYMOUS_ID_HEADER)).toBe("guest-1");
  });

  it("lists orders without an order number", async () => {
    const { client, fetchMock } = setup(() => jsonResponse({ orders: [] }));

    await client.orders.list({ catalogLocale: "en-US" });

    expect(lastCall(fetchMock).url).toBe("https://shop.example.com/api/commerce-ai/orders?catalogLocale=en-US");
  });
});

describe("base URL and credentials", () => {
  it("sends the session token only to requests built from baseUrl", async () => {
    const { client, fetchMock } = setup(() => jsonResponse({ cart: null }), {
      getSessionToken: () => "token-abc",
      getAnonymousId: () => "guest-1",
    });

    await client.cart.get({});
    await client.cart.add({ sku: "A" });
    await client.orders.get({ orderNumber: "https://evil.example.net/steal" });

    for (const [url] of fetchMock.mock.calls) {
      expect(new URL(String(url)).origin).toBe("https://shop.example.com");
    }
  });

  it("works with a relative base URL and strips trailing slashes", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse({ products: [] }));
    const client = createCommerceAIApiClient({ baseUrl: "/api/commerce-ai//", fetch: fetchMock });

    await client.search({ query: "q" });

    expect(String(fetchMock.mock.calls[0]![0])).toBe("/api/commerce-ai/search");
  });

  it("falls back to the global fetch at call time", async () => {
    const globalFetch = vi.fn<typeof fetch>(async () => jsonResponse({ products: [] }));
    vi.stubGlobal("fetch", globalFetch);
    try {
      const client = createCommerceAIApiClient({ baseUrl: "/api" });
      await client.search({ query: "q" });
      expect(globalFetch).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("never logs the session token", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => {}),
    );
    try {
      const { client } = setup(() => jsonResponse({ error: "no", code: "SESSION_INVALID" }, 401), {
        getSessionToken: () => "token-abc",
      });
      await client.cart.get({}).catch(() => undefined);
      for (const spy of spies) {
        expect(spy).not.toHaveBeenCalled();
      }
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });
});
