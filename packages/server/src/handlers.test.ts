import { Readable } from "node:stream";
import type { IncomingMessage } from "node:http";
import {
  AIOutputTruncatedError,
  AIRateLimitedError,
  AIUpstreamError,
  ANONYMOUS_ID_HEADER,
  CART_SESSION_HEADER,
  CartAccessDeniedError,
  CartNotFoundError,
  CountryNotAllowedError,
  CurrencyMismatchError,
  InvalidCredentialsError,
  SearchTimeoutError,
  MissingPriceError,
  PaymentDeclinedError,
  UnsupportedAudioTypeError,
  VoiceNotConfiguredError,
} from "@commerce-ai-tool/core";
import type { CartSnapshot, CommercetoolsClient, SearchOrchestrator } from "@commerce-ai-tool/core";
import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHandlers } from "./handlers.js";
import { signCartSession } from "./cart-session.js";
import { LOGIN_RATE_LIMIT_MESSAGE, TooManyRequestsError } from "./rate-limit.js";
import type { CommerceAIServer } from "./server.js";
import {
  executeSearch,
  executeSearchSuggestions,
  executeSearchVoice,
  executeTts,
  mapRouteError,
} from "./route-actions.js";
import { HttpError, ValidationError } from "./errors.js";

const sampleCart: CartSnapshot = {
  id: "cart-1",
  version: 2,
  anonymousId: "anon-1",
  lineItems: [
    {
      id: "li-1",
      name: "Red Shoe",
      sku: "SHOE-RED",
      productId: "p1",
      quantity: 1,
      price: { amount: 49.99, currency: "EUR", formatted: "€49.99" },
    },
  ],
  totalPrice: { amount: 49.99, currency: "EUR", formatted: "€49.99" },
  totalQuantity: 1,
};

function createMockServer(overrides: Partial<CommerceAIServer> = {}): CommerceAIServer {
  const orchestrator = {
    searchByText: vi.fn().mockResolvedValue({
      products: [{ id: "p1", name: "Shoe" }],
      meta: { total: 1 },
    }),
    searchByVoice: vi.fn().mockResolvedValue({
      transcript: "red shoes",
      enhancedQuery: "red running shoes",
      products: [],
      meta: { total: 0 },
      ttsText: "Found shoes",
    }),
    searchByImage: vi.fn().mockResolvedValue({
      interpretation: "sneakers",
      products: [],
      meta: { total: 0 },
    }),
    suggestByText: vi.fn().mockResolvedValue({
      suggestions: ["Red Shoes", "Running Shoes"],
    }),
    getFacetSchema: vi.fn().mockResolvedValue({ attributes: [], systemFacets: [], etag: "e", resolvedAt: "2026-01-01T00:00:00.000Z" }),
  } satisfies Partial<SearchOrchestrator>;

  return {
    orchestrator: orchestrator as SearchOrchestrator,
    commercetools: {
      getCart: vi.fn().mockResolvedValue(sampleCart),
      getCustomerCart: vi.fn().mockResolvedValue(sampleCart),
      addToCart: vi.fn().mockResolvedValue(sampleCart),
      addItemsToCart: vi.fn().mockResolvedValue(sampleCart),
      removeLineItem: vi.fn().mockResolvedValue(sampleCart),
      changeLineItemQuantity: vi.fn().mockResolvedValue(sampleCart),
      loginAndMerge: vi.fn(),
    } as unknown as CommercetoolsClient,
    cartDefaults: { currency: "EUR", catalogLocale: "en" },
    cartSessionSecret: "test-secret",
    transcribeAudio: vi.fn(),
    synthesizeSpeech: vi.fn().mockResolvedValue(Buffer.from("mp3-bytes")),
    ...overrides,
  };
}

function jsonRequest(body: unknown): IncomingMessage {
  return Readable.from([Buffer.from(JSON.stringify(body))]) as unknown as IncomingMessage;
}

function createTestApp(handlers: ReturnType<typeof createHandlers>) {
  const app = express();

  app.get("/health", async (_req, res) => {
    const response = await handlers.health();
    res.status(response.status);
    if (response.headers) {
      for (const [key, value] of Object.entries(response.headers)) {
        res.setHeader(key, value);
      }
    }
    res.send(response.body);
  });

  app.post("/search", async (req, res) => {
    const response = await handlers.search(req);
    res.status(response.status);
    if (response.headers) {
      for (const [key, value] of Object.entries(response.headers)) {
        res.setHeader(key, value);
      }
    }
    res.send(response.body);
  });

  app.post("/search/suggestions", async (req, res) => {
    const response = await handlers.searchSuggestions(req);
    res.status(response.status);
    if (response.headers) {
      for (const [key, value] of Object.entries(response.headers)) {
        res.setHeader(key, value);
      }
    }
    res.send(response.body);
  });

  app.post("/search/voice", async (req, res) => {
    const response = await handlers.searchVoice(req);
    res.status(response.status);
    if (response.headers) {
      for (const [key, value] of Object.entries(response.headers)) {
        res.setHeader(key, value);
      }
    }
    res.send(response.body);
  });

  app.post("/search/image", async (req, res) => {
    const response = await handlers.searchImage(req);
    res.status(response.status);
    if (response.headers) {
      for (const [key, value] of Object.entries(response.headers)) {
        res.setHeader(key, value);
      }
    }
    res.send(response.body);
  });

  app.post("/tts", async (req, res) => {
    const response = await handlers.tts(req);
    res.status(response.status);
    if (response.headers) {
      for (const [key, value] of Object.entries(response.headers)) {
        res.setHeader(key, value);
      }
    }
    res.send(response.body);
  });

  app.get("/cart", async (req, res) => {
    const response = await handlers.getCart(req);
    res.status(response.status);
    if (response.headers) {
      for (const [key, value] of Object.entries(response.headers)) {
        res.setHeader(key, value);
      }
    }
    res.send(response.body);
  });

  app.post("/cart/add", async (req, res) => {
    const response = await handlers.addToCart(req);
    res.status(response.status);
    if (response.headers) {
      for (const [key, value] of Object.entries(response.headers)) {
        res.setHeader(key, value);
      }
    }
    res.send(response.body);
  });

  app.post("/cart/add-items", async (req, res) => {
    const response = await handlers.addItemsToCart(req);
    res.status(response.status);
    if (response.headers) {
      for (const [key, value] of Object.entries(response.headers)) {
        res.setHeader(key, value);
      }
    }
    res.send(response.body);
  });

  return app;
}

describe("route-actions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("executeSearch rejects empty query", async () => {
    const server = createMockServer();

    await expect(executeSearch(server, { query: "  " })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("executeSearch delegates to orchestrator", async () => {
    const server = createMockServer();

    const result = await executeSearch(server, {
      query: "red shoes",
      queryLocale: "en",
      catalogLocale: "no",
      limit: 5,
    });

    expect(server.orchestrator.searchByText).toHaveBeenCalledWith({
      query: "red shoes",
      queryLocale: "en",
      catalogLocale: "no",
      locale: undefined,
      limit: 5,
    });
    expect(result).toEqual({
      products: [{ id: "p1", name: "Shoe" }],
      meta: { total: 1 },
    });
  });

  it("executeSearchSuggestions rejects short query", async () => {
    const server = createMockServer();

    await expect(executeSearchSuggestions(server, { query: "  " })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(executeSearchSuggestions(server, { query: "a" })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("executeSearchSuggestions delegates to orchestrator", async () => {
    const server = createMockServer();

    const result = await executeSearchSuggestions(server, {
      query: "red",
      catalogLocale: "en",
      limit: 5,
    });

    expect(server.orchestrator.suggestByText).toHaveBeenCalledWith({
      query: "red",
      catalogLocale: "en",
      queryLocale: "en",
      limit: 5,
    });
    expect(result).toEqual({ suggestions: ["Red Shoes", "Running Shoes"] });
  });

  it("executeSearchSuggestions replaces invalid and unsupported catalog locales but keeps the query locale", async () => {
    const server = { ...createMockServer(), supportedLocales: ["en", "de-DE"] };

    await executeSearchSuggestions(server, {
      query: "red",
      catalogLocale: "xx_INVALID!!",
      queryLocale: "fr-FR",
    });
    await executeSearchSuggestions(server, { query: "red", catalogLocale: "de-de" });

    const calls = vi.mocked(server.orchestrator.suggestByText).mock.calls;
    expect(calls[0]?.[0]).toMatchObject({ catalogLocale: "en", queryLocale: "fr-FR" });
    expect(calls[1]?.[0]).toMatchObject({ catalogLocale: "de-DE", queryLocale: "de-DE" });
  });

  it("executeTts rejects empty text", async () => {
    const server = createMockServer();

    await expect(executeTts(server, "   ")).rejects.toBeInstanceOf(ValidationError);
  });

  it("executeSearchVoice includes blocking TTS audio summary", async () => {
    const server = createMockServer();

    const result = await executeSearchVoice(server, { blockingTts: "true" }, {
      buffer: Buffer.from("audio"),
      mimeType: "audio/webm",
      filename: "voice.webm",
    });

    expect(server.synthesizeSpeech).toHaveBeenCalledWith("Found shoes");
    expect(result.audioSummary).toBe(Buffer.from("mp3-bytes").toString("base64"));
    expect(result.ttsPending).toBe(false);
  });

  it("mapRouteError maps an unsupported audio type to 415 without echoing the MIME type", () => {
    expect(
      mapRouteError(new UnsupportedAudioTypeError("audio/<script>"), "searchVoice", "fail"),
    ).toEqual({
      message: "Unsupported audio type",
      status: 415,
      code: "UNSUPPORTED_MEDIA_TYPE",
    });
  });

  it("mapRouteError maps an unconfigured voice backend to 503 without config details", () => {
    expect(mapRouteError(new VoiceNotConfiguredError(), "searchVoice", "fail")).toEqual({
      message: "Voice service is not configured",
      status: 503,
      code: "UPSTREAM_UNAVAILABLE",
    });
  });

  it("mapRouteError maps classified AI provider errors to fixed messages", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(mapRouteError(new AIRateLimitedError(), "search", "fail")).toEqual({
      message: "The AI service is busy, try again shortly",
      status: 429,
      code: "RATE_LIMITED",
    });
    expect(mapRouteError(new AIUpstreamError(402), "search", "fail")).toEqual({
      message: "The AI service is unavailable",
      status: 503,
      code: "UPSTREAM_UNAVAILABLE",
    });
    expect(mapRouteError(new AIUpstreamError(503), "search", "fail")).toEqual({
      message: "The AI service is unavailable",
      status: 503,
      code: "UPSTREAM_UNAVAILABLE",
    });
    expect(
      mapRouteError(new AIOutputTruncatedError("interpret", "some/model"), "search", "fail"),
    ).toEqual({
      message: "The AI service returned an incomplete answer",
      status: 503,
      code: "UPSTREAM_UNAVAILABLE",
    });
  });

  it("mapRouteError maps a client abort to 499 without logging an error", () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(
      mapRouteError(new DOMException("This operation was aborted", "AbortError"), "search", "fail"),
    ).toEqual({ message: "Request aborted", status: 499, code: "INTERNAL" });
    expect(errorLog).not.toHaveBeenCalled();
  });

  it("mapRouteError maps timeout and validation errors", () => {
    expect(mapRouteError(new SearchTimeoutError("voice", 20_000), "searchVoice", "fail")).toEqual({
      message: "Search timed out after 20000ms at step: voice",
      status: 504,
      code: "TIMEOUT",
    });

    expect(mapRouteError(new ValidationError("bad input"), "search", "fail")).toEqual({
      message: "bad input",
      status: 400,
      code: "VALIDATION",
    });

    expect(mapRouteError(new CountryNotAllowedError(), "setCartAddresses", "fail")).toEqual({
      message: "Shipping country is not allowed",
      status: 400,
      code: "VALIDATION",
    });
    expect(
      mapRouteError(new CurrencyMismatchError("CHF vs EUR internal"), "createOrder", "fail"),
    ).toEqual({
      message: "The cart currency does not match the shipping country",
      status: 400,
      code: "VALIDATION",
    });

    expect(mapRouteError(new MissingPriceError("no GBP+DE price"), "addToCart", "fail")).toEqual({
      message: "No matching price for this cart currency and country",
      status: 400,
      code: "MISSING_PRICE",
    });

    expect(mapRouteError(new CartNotFoundError(), "removeFromCart", "fail")).toEqual({
      message: "Cart not found",
      status: 404,
      code: "CART_NOT_FOUND",
    });

    expect(mapRouteError(new CartAccessDeniedError(), "removeFromCart", "fail")).toEqual({
      message: "Cart does not belong to this session",
      status: 403,
      code: "CART_ACCESS_DENIED",
    });

    expect(mapRouteError(new InvalidCredentialsError(), "login", "fail")).toEqual({
      message: "Invalid credentials",
      status: 401,
      code: "INVALID_CREDENTIALS",
    });

    expect(mapRouteError(new TooManyRequestsError(60), "login", "fail")).toEqual({
      message: LOGIN_RATE_LIMIT_MESSAGE,
      status: 429,
      code: "RATE_LIMITED",
    });
  });
});

describe("mapRouteError fallthrough", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the fallback and INTERNAL for unknown errors and non-Error throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(mapRouteError(new Error("secret detail"), "search", "Search failed")).toEqual({
      message: "Search failed",
      status: 500,
      code: "INTERNAL",
    });
    expect(mapRouteError("boom", "search", "Search failed")).toEqual({
      message: "Search failed",
      status: 500,
      code: "INTERNAL",
    });
  });

  it("a 503 UPSTREAM_UNAVAILABLE is logged at warn", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CAT_DEBUG", "");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    mapRouteError(new VoiceNotConfiguredError(), "searchVoice", "fail");
    mapRouteError(new HttpError(503, "UPSTREAM_UNAVAILABLE", "Facet schema is not available"), "facetSchema", "fail");

    expect(warnSpy.mock.calls.map((call) => call[0])).toEqual([
      "[commerce-ai-tool/server] searchVoice: UPSTREAM_UNAVAILABLE (503)",
      "[commerce-ai-tool/server] facetSchema: UPSTREAM_UNAVAILABLE (503)",
    ]);
    expect(errorSpy).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("does not log 4xx client errors", () => {
    vi.stubEnv("NODE_ENV", "development");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    mapRouteError(new UnsupportedAudioTypeError("audio/<script>"), "searchVoice", "fail");
    mapRouteError(new ValidationError("bad input"), "search", "fail");
    mapRouteError(new HttpError(413, "PAYLOAD_TOO_LARGE", "Too large"), "searchImage", "fail");

    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("maps HttpError to its own status and code", () => {
    expect(
      mapRouteError(new HttpError(503, "UPSTREAM_UNAVAILABLE", "Voice service is not configured"), "tts", "fail"),
    ).toEqual({
      message: "Voice service is not configured",
      status: 503,
      code: "UPSTREAM_UNAVAILABLE",
    });
  });
});

describe("createHandlers request abort", () => {
  it("maps any error to 499 without logging once the request signal is aborted", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const server = createMockServer();
    const controller = new AbortController();
    controller.abort(Object.assign(new Error("closed"), { name: "SomethingElse" }));
    vi.mocked(server.orchestrator.searchByText).mockRejectedValue(new Error("ECONNRESET upstream"));
    const handlers = createHandlers(server);

    const response = await handlers.search(jsonRequest({ query: "hat" }), undefined, controller.signal);

    expect(response.status).toBe(499);
    expect(errorLog).not.toHaveBeenCalled();
    errorLog.mockRestore();
  });
});

describe("createHandlers tts abort", () => {
  it("forwards the request signal to synthesizeSpeech", async () => {
    const server = createMockServer();
    const controller = new AbortController();
    const handlers = createHandlers(server);

    const response = await handlers.tts(jsonRequest({ text: "hello" }), undefined, controller.signal);

    expect(response.status).toBe(200);
    expect(server.synthesizeSpeech).toHaveBeenCalledWith("hello", controller.signal);
  });

  it("maps a synthesis cut short by the client to 499 without logging an error", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const server = createMockServer();
    const controller = new AbortController();
    vi.mocked(server.synthesizeSpeech).mockImplementation(async () => {
      controller.abort();
      throw new Error("socket hang up");
    });
    const handlers = createHandlers(server);

    const response = await handlers.tts(jsonRequest({ text: "hello" }), undefined, controller.signal);

    expect(response.status).toBe(499);
    expect(errorLog).not.toHaveBeenCalled();
    errorLog.mockRestore();
  });
});

describe("createHandlers HTTP", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("health returns ok", async () => {
    const handlers = createHandlers(createMockServer());
    const response = await handlers.health();

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body as string)).toEqual({ status: "ok" });
  });

  it("returns the generic fallback, not the internal message, for unknown errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const server = createMockServer();
    vi.mocked(server.orchestrator.searchByText).mockRejectedValue(
      new Error("ECONNRESET at 10.0.0.1"),
    );
    const handlers = createHandlers(server);
    const response = await handlers.search(jsonRequest({ query: "boots" }));

    expect(response.status).toBe(500);
    expect(JSON.parse(response.body as string)).toEqual({
      error: "Search failed",
      code: "INTERNAL",
    });
    expect(response.body as string).not.toContain("10.0.0.1");
  });

  it("maps malformed JSON to 400 VALIDATION", async () => {
    const handlers = createHandlers(createMockServer());
    const req = Readable.from([Buffer.from("{")]) as unknown as IncomingMessage;
    const response = await handlers.search(req);

    expect(response.status).toBe(400);
    expect(JSON.parse(response.body as string)).toEqual({
      error: "Invalid JSON body",
      code: "VALIDATION",
    });
  });

  it("maps a non-object JSON body to 400 VALIDATION", async () => {
    const handlers = createHandlers(createMockServer());
    const response = await handlers.tts(jsonRequest(null));

    expect(response.status).toBe(400);
    expect(JSON.parse(response.body as string)).toMatchObject({ code: "VALIDATION" });
  });

  it("maps missing tts text to 400", async () => {
    const handlers = createHandlers(createMockServer());
    const response = await handlers.tts(jsonRequest({}));

    expect(response.status).toBe(400);
    expect(JSON.parse(response.body as string)).toEqual({
      error: "text is required",
      code: "VALIDATION",
    });
  });

  it("rejects tts text over 500 chars with 400", async () => {
    const server = createMockServer();
    const handlers = createHandlers(server);
    const response = await handlers.tts(jsonRequest({ text: "a".repeat(501) }));

    expect(response.status).toBe(400);
    expect(JSON.parse(response.body as string)).toEqual({
      error: "text must be at most 500 characters",
      code: "VALIDATION",
    });
    expect(server.synthesizeSpeech).not.toHaveBeenCalled();
  });

  it("accepts tts text of exactly 500 chars", async () => {
    const server = createMockServer();
    const handlers = createHandlers(server);
    const response = await handlers.tts(jsonRequest({ text: "a".repeat(500) }));

    expect(response.status).toBe(200);
  });

  it("rejects query over 300 chars with 400", async () => {
    const server = createMockServer();
    const handlers = createHandlers(server);
    const response = await handlers.search(jsonRequest({ query: "a".repeat(301) }));

    expect(response.status).toBe(400);
    expect(JSON.parse(response.body as string)).toEqual({
      error: "query must be at most 300 characters",
      code: "VALIDATION",
    });
    expect(server.orchestrator.searchByText).not.toHaveBeenCalled();
  });

  it("rejects refineQuery over 300 chars with 400", async () => {
    const server = createMockServer();
    const handlers = createHandlers(server);
    const response = await handlers.search(
      jsonRequest({ query: "boots", refineQuery: "a".repeat(301), searchTerms: ["boots"] }),
    );

    expect(response.status).toBe(400);
    expect(JSON.parse(response.body as string)).toEqual({
      error: "refineQuery must be at most 300 characters",
      code: "VALIDATION",
    });
  });

  it("forwards validated searchTerms, sort and suggestedFacets (trimmed) to the orchestrator", async () => {
    const server = createMockServer();
    const handlers = createHandlers(server);
    const response = await handlers.search(
      jsonRequest({
        query: "boots",
        searchTerms: ["  red boots ", "leather"],
        sort: "price_asc",
        suggestedFacets: [{ name: "color", reason: "shoppers filter by colour", extra: 1 }],
      }),
    );

    expect(response.status).toBe(200);
    expect(server.orchestrator.searchByText).toHaveBeenCalledWith(
      expect.objectContaining({
        searchTerms: ["red boots", "leather"],
        sort: "price_asc",
        suggestedFacets: [{ name: "color", reason: "shoppers filter by colour" }],
      }),
    );
  });

  it.each([
    ["a non-string entry", { searchTerms: [1] }],
    ["a plain string", { searchTerms: "red shoes" }],
    ["an object", { searchTerms: { 0: "red" } }],
    ["an empty entry", { searchTerms: ["  "] }],
    ["more than 20 entries", { searchTerms: Array.from({ length: 21 }, (_, i) => `term ${i}`) }],
    ["an over-long entry", { searchTerms: ["a".repeat(301)] }],
    ["an unknown sort", { sort: "newest" }],
    ["a non-string sort", { sort: 1 }],
    ["suggestedFacets that is not an array", { suggestedFacets: "color" }],
    ["a suggestedFacets entry that is a string", { suggestedFacets: ["color"] }],
    ["a suggestedFacets entry without a name", { suggestedFacets: [{ reason: "x" }] }],
    ["a non-string suggestedFacets reason", { suggestedFacets: [{ name: "color", reason: 1 }] }],
    ["more than 20 suggestedFacets", { suggestedFacets: Array.from({ length: 21 }, () => ({ name: "color" })) }],
    ["an over-long suggestedFacets name", { suggestedFacets: [{ name: "a".repeat(101) }] }],
  ])("rejects %s with 400 VALIDATION instead of a 500", async (_label, fields) => {
    const server = createMockServer();
    const handlers = createHandlers(server);
    const response = await handlers.search(jsonRequest({ query: "boots", ...fields }));

    expect(response.status).toBe(400);
    expect(JSON.parse(response.body as string)).toMatchObject({ code: "VALIDATION" });
    expect(server.orchestrator.searchByText).not.toHaveBeenCalled();
  });

  it("accepts searchTerms at the limits", async () => {
    const server = createMockServer();
    const handlers = createHandlers(server);
    const searchTerms = Array.from({ length: 20 }, (_, i) => (i === 0 ? "a".repeat(300) : `term ${i}`));
    const response = await handlers.search(jsonRequest({ query: "boots", searchTerms }));

    expect(response.status).toBe(200);
  });

  it("forwards facetSelections to the orchestrator", async () => {
    const server = createMockServer();
    const handlers = createHandlers(server);
    // `filters` carries the concrete (single-valued) filter values; `facetSelections` only names the chip groups.
    const facetSelections = { color: ["red"], categories: ["cat-1"] };
    const response = await handlers.search(
      jsonRequest({ query: "boots", filters: { color: "red", category: "cat-1" }, facetSelections }),
    );

    expect(response.status).toBe(200);
    expect(server.orchestrator.searchByText).toHaveBeenCalledWith(
      expect.objectContaining({ facetSelections, filters: { color: "red", category: "cat-1" } }),
    );
  });

  it("leaves facetSelections undefined when the client omits it", async () => {
    const server = createMockServer();
    const handlers = createHandlers(server);
    await handlers.search(jsonRequest({ query: "boots" }));

    expect(vi.mocked(server.orchestrator.searchByText).mock.calls[0]?.[0].facetSelections).toBeUndefined();
  });

  it.each([
    ["an array", ["color"]],
    ["a string", "color"],
    ["a group that is not an array", { color: "red" }],
    ["a non-string value", { color: ["red", 3] }],
    ["too many groups", Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`attr${i}`, ["x"]]))],
    ["too many values in a group", { color: Array.from({ length: 21 }, (_, i) => `v${i}`) }],
    ["an over-long group id", { ["a".repeat(101)]: ["x"] }],
    ["an over-long value", { color: ["a".repeat(201)] }],
  ])("rejects facetSelections with %s with 400", async (_label, facetSelections) => {
    const server = createMockServer();
    const handlers = createHandlers(server);
    const response = await handlers.search(jsonRequest({ query: "boots", facetSelections }));

    expect(response.status).toBe(400);
    expect(JSON.parse(response.body as string)).toMatchObject({ code: "VALIDATION" });
    expect(server.orchestrator.searchByText).not.toHaveBeenCalled();
  });

  it("accepts facetSelections at the limits", async () => {
    const server = createMockServer();
    const handlers = createHandlers(server);
    const facetSelections = Object.fromEntries(
      Array.from({ length: 20 }, (_, i) => [
        i === 0 ? "a".repeat(100) : `attr${i}`,
        Array.from({ length: 20 }, (_, v) => "v".repeat(v === 0 ? 200 : 50)),
      ]),
    );
    const response = await handlers.search(jsonRequest({ query: "boots", facetSelections }));

    expect(response.status).toBe(200);
  });

  it("rejects suggestions query over 300 chars with 400", async () => {
    const server = createMockServer();
    const handlers = createHandlers(server);
    const response = await handlers.searchSuggestions(jsonRequest({ query: "a".repeat(301) }));

    expect(response.status).toBe(400);
    expect(JSON.parse(response.body as string)).toMatchObject({ code: "VALIDATION" });
    expect(server.orchestrator.suggestByText).not.toHaveBeenCalled();
  });

  it("clamps search limit 1000 to 100", async () => {
    const server = createMockServer();
    const handlers = createHandlers(server);
    const response = await handlers.search(jsonRequest({ query: "boots", limit: 1000 }));

    expect(response.status).toBe(200);
    expect(server.orchestrator.searchByText).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 100 }),
    );
  });

  it("leaves search limit unset when the client omits it", async () => {
    const server = createMockServer();
    const handlers = createHandlers(server);
    await handlers.search(jsonRequest({ query: "boots" }));

    expect(vi.mocked(server.orchestrator.searchByText).mock.calls[0]?.[0].limit).toBeUndefined();
  });

  it("maps a non-string search query to 400", async () => {
    const handlers = createHandlers(createMockServer());
    const response = await handlers.search(jsonRequest({ query: 42 }));

    expect(response.status).toBe(400);
    expect(JSON.parse(response.body as string)).toEqual({
      error: "query is required",
      code: "VALIDATION",
    });
  });

  it("maps PaymentDeclinedError to 402 PAYMENT_DECLINED", async () => {
    const server = createMockServer();
    vi.mocked(server.orchestrator.searchByText).mockRejectedValue(
      new PaymentDeclinedError("Card declined"),
    );
    const handlers = createHandlers(server);
    const response = await handlers.search(jsonRequest({ query: "boots" }));

    expect(response.status).toBe(402);
    expect(JSON.parse(response.body as string)).toEqual({
      error: "Payment was declined",
      code: "PAYMENT_DECLINED",
    });
  });

  it("search validates query via IncomingMessage", async () => {
    const handlers = createHandlers(createMockServer());
    const response = await handlers.search(jsonRequest({ query: "" }));

    expect(response.status).toBe(400);
    expect(JSON.parse(response.body as string)).toEqual({ error: "query is required", code: "VALIDATION" });
  });

  it("search returns orchestrator result", async () => {
    const server = createMockServer();
    const handlers = createHandlers(server);
    const response = await handlers.search(jsonRequest({ query: "boots" }));

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body as string)).toEqual({
      products: [{ id: "p1", name: "Shoe" }],
      meta: { total: 1 },
    });
  });

  it("searchSuggestions validates query via IncomingMessage", async () => {
    const handlers = createHandlers(createMockServer());
    const response = await handlers.searchSuggestions(jsonRequest({ query: "" }));

    expect(response.status).toBe(400);
    expect(JSON.parse(response.body as string)).toEqual({
      error: "query must be at least 2 characters",
      code: "VALIDATION",
    });
  });

  it("searchSuggestions returns orchestrator result", async () => {
    const server = createMockServer();
    const handlers = createHandlers(server);
    const response = await handlers.searchSuggestions(jsonRequest({ query: "red" }));

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body as string)).toEqual({
      suggestions: ["Red Shoes", "Running Shoes"],
    });
  });

  it("tts returns audio buffer", async () => {
    const handlers = createHandlers(createMockServer());
    const response = await handlers.tts(jsonRequest({ text: "hello" }));

    expect(response.status).toBe(200);
    expect(response.headers?.["Content-Type"]).toBe("audio/mpeg");
    expect(response.body).toEqual(Buffer.from("mp3-bytes"));
  });

  it("express routes handle search and multipart voice", async () => {
    const server = createMockServer();
    const app = createTestApp(createHandlers(server));

    const searchResponse = await request(app)
      .post("/search")
      .send({ query: "jacket", limit: 3 })
      .expect(200);

    expect(searchResponse.body).toEqual({
      products: [{ id: "p1", name: "Shoe" }],
      meta: { total: 1 },
    });
    expect(server.orchestrator.searchByText).toHaveBeenCalledWith(
      expect.objectContaining({ query: "jacket", limit: 3 }),
    );

    const suggestionsResponse = await request(app)
      .post("/search/suggestions")
      .send({ query: "red" })
      .expect(200);

    expect(suggestionsResponse.body).toEqual({
      suggestions: ["Red Shoes", "Running Shoes"],
    });
    expect(server.orchestrator.suggestByText).toHaveBeenCalled();

    const voiceResponse = await request(app)
      .post("/search/voice")
      .field("enableTts", "false")
      .attach("audio", Buffer.from("voice-data"), {
        filename: "clip.webm",
        contentType: "audio/webm",
      })
      .expect(200);

    expect(voiceResponse.body.transcript).toBe("red shoes");
    expect(server.orchestrator.searchByVoice).toHaveBeenCalled();
  });

  it("voice error context logs normalised locales, never the raw client values", async () => {
    vi.stubEnv("CAT_DEBUG", "true");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const server = createMockServer();
    vi.mocked(server.orchestrator.searchByVoice).mockRejectedValue(new Error("boom"));
    const app = createTestApp(createHandlers(server));

    await request(app)
      .post("/search/voice")
      .field("queryLocale", "<script>raw-query-locale</script>")
      .field("catalogLocale", "raw catalog locale")
      .attach("audio", Buffer.from("voice-data"), { filename: "clip.webm", contentType: "audio/webm" })
      .expect(500);

    const logged = JSON.stringify(errorSpy.mock.calls);
    expect(logged).toContain("context");
    expect(logged).not.toContain("raw-query-locale");
    expect(logged).not.toContain("raw catalog locale");
    vi.unstubAllEnvs();
  });

  it("forwards enableMissions and returns mission from voice search", async () => {
    const mission = {
      interpretation: "glasses and table",
      intents: [
        {
          intent: { id: "intent-0", label: "glasses", quantity: 1, searchTerms: ["glasses"] },
          products: [{ id: "p1", name: "Glass" }],
          total: 1,
        },
      ],
    };
    const server = createMockServer();
    vi.mocked(server.orchestrator.searchByVoice).mockResolvedValue({
      transcript: "glasses and a coffee table",
      enhancedQuery: "glasses and coffee table",
      products: [{ id: "p1", name: "Glass" }],
      meta: {
        total: 1,
        limit: 20,
        offset: 0,
        locale: "en",
        catalogLocale: "en",
        queryLocale: "en",
      },
      mission,
    });
    const app = createTestApp(createHandlers(server));

    const response = await request(app)
      .post("/search/voice")
      .field("enableTts", "false")
      .field("enableMissions", "true")
      .attach("audio", Buffer.from("voice-data"), {
        filename: "clip.webm",
        contentType: "audio/webm",
      })
      .expect(200);

    expect(response.body.mission).toEqual(mission);
    expect(server.orchestrator.searchByVoice).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      "audio/webm",
      expect.objectContaining({ enableMissions: true, enableTts: false }),
    );
  });

  it("express routes reject voice search without audio", async () => {
    const app = createTestApp(createHandlers(createMockServer()));

    const response = await request(app)
      .post("/search/voice")
      .field("limit", "5")
      .expect(400);

    expect(response.body).toEqual({ error: "audio file is required", code: "VALIDATION" });
  });

  it("express routes handle image upload", async () => {
    const server = createMockServer();
    const app = createTestApp(createHandlers(server));

    const response = await request(app)
      .post("/search/image")
      .field("catalogLocale", "no")
      .attach("image", Buffer.from("image-bytes"), {
        filename: "photo.jpg",
        contentType: "image/jpeg",
      })
      .expect(200);

    expect(response.body.interpretation).toBe("sneakers");
    expect(server.orchestrator.searchByImage).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      "image/jpeg",
      expect.objectContaining({ catalogLocale: "no" }),
    );
  });

  it("getCart returns the current cart", async () => {
    const handlers = createHandlers(createMockServer());
    const req = {
      url: "/cart?catalogLocale=en",
      headers: { [ANONYMOUS_ID_HEADER]: "anon-1" },
    } as unknown as IncomingMessage;
    const response = await handlers.getCart(req);

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body as string)).toEqual({ cart: sampleCart });
  });

  it("getCart reads the session from the cart session header", async () => {
    const server = createMockServer();
    const token = signCartSession({ customerId: "cust-1" }, "test-secret");
    const handlers = createHandlers(server);
    const req = {
      url: "/cart",
      headers: { [CART_SESSION_HEADER]: token },
    } as unknown as IncomingMessage;

    const response = await handlers.getCart(req);

    expect(server.commercetools.getCustomerCart).toHaveBeenCalledWith("cust-1", "en");
    expect(server.commercetools.getCart).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it("GET /orders reads anonymousId from the header", async () => {
    const server = createMockServer();
    const getOrder = vi.fn().mockResolvedValue({ id: "order-1" });
    const listOrders = vi.fn().mockResolvedValue([]);
    Object.assign(server.commercetools, { getOrder, listOrders });
    const handlers = createHandlers(server);

    const single = await handlers.getOrder({
      url: "/orders?orderNumber=cat-1",
      headers: { [ANONYMOUS_ID_HEADER]: "anon-1" },
    } as unknown as IncomingMessage);
    const list = await handlers.getOrder({
      url: "/orders?anonymousId=query-anon",
      headers: { [ANONYMOUS_ID_HEADER]: ["anon-1"] },
    } as unknown as IncomingMessage);
    const queryOnly = await handlers.getCart({
      url: "/cart?anonymousId=anon-legacy",
      headers: {},
    } as unknown as IncomingMessage);

    expect([single.status, list.status, queryOnly.status]).toEqual([200, 200, 400]);
    expect(getOrder).toHaveBeenCalledWith(
      expect.objectContaining({ orderNumber: "cat-1", anonymousId: "anon-1" }),
    );
    expect(listOrders).toHaveBeenCalledWith(expect.objectContaining({ anonymousId: "anon-1" }));
    expect(server.commercetools.getCart).not.toHaveBeenCalled();
  });

  it("logout reads the cart session header and calls onLogout", async () => {
    const onLogout = vi.fn();
    const handlers = createHandlers(createMockServer({ cartSessionHooks: { onLogout } }));
    const token = signCartSession({ customerId: "cust-1" }, "test-secret");

    const response = await handlers.logout({
      url: "/cart/logout",
      headers: { [CART_SESSION_HEADER]: token },
    } as unknown as IncomingMessage);

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body as string)).toEqual({ cart: null, customer: null });
    expect(onLogout).toHaveBeenCalledWith(expect.objectContaining({ customerId: "cust-1" }));
  });

  it("logout without a token returns 200 and skips onLogout", async () => {
    const onLogout = vi.fn();
    const handlers = createHandlers(createMockServer({ cartSessionHooks: { onLogout } }));

    const response = await handlers.logout();

    expect(response.status).toBe(200);
    expect(onLogout).not.toHaveBeenCalled();
  });

  it("logout is 200 for a missing, invalid or revoked token, and 500 when a host hook throws", async () => {
    const token = signCartSession({ customerId: "cust-1" }, "test-secret");
    const withToken = {
      url: "/cart/logout",
      headers: { [CART_SESSION_HEADER]: token },
    } as unknown as IncomingMessage;
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const revoked = createHandlers(
      createMockServer({ cartSessionHooks: { onLogout: vi.fn(), isRevoked: () => true } }),
    );
    expect((await revoked.logout(withToken)).status).toBe(200);

    const garbage = createHandlers(createMockServer({ cartSessionHooks: { onLogout: vi.fn() } }));
    expect(
      (
        await garbage.logout({
          url: "/cart/logout",
          headers: { [CART_SESSION_HEADER]: "not-a-token" },
        } as unknown as IncomingMessage)
      ).status,
    ).toBe(200);

    const onLogoutThrows = createHandlers(
      createMockServer({
        cartSessionHooks: {
          onLogout: () => {
            throw new Error("denylist write failed: secret-detail");
          },
        },
      }),
    );
    const failed = await onLogoutThrows.logout(withToken);
    expect(failed.status).toBe(500);
    expect(JSON.parse(failed.body as string)).toMatchObject({ code: "INTERNAL" });
    expect(failed.body as string).not.toContain("secret-detail");

    const isRevokedThrows = createHandlers(
      createMockServer({
        cartSessionHooks: {
          onLogout: vi.fn(),
          isRevoked: async () => {
            throw new Error("denylist read failed: secret-detail");
          },
        },
      }),
    );
    const failedRevocation = await isRevokedThrows.logout(withToken);
    expect(failedRevocation.status).toBe(500);
    expect(failedRevocation.body as string).not.toContain("secret-detail");
    error.mockRestore();
  });

  it("a throwing isRevoked hook fails a cart read with 500, not 401", async () => {
    const token = signCartSession({ customerId: "cust-1" }, "test-secret");
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const handlers = createHandlers(
      createMockServer({
        cartSessionHooks: {
          isRevoked: () => {
            throw new Error("denylist down: secret-detail");
          },
        },
      }),
    );

    const response = await handlers.getCart({
      url: "/cart",
      headers: { [CART_SESSION_HEADER]: token },
    } as unknown as IncomingMessage);

    expect(response.status).toBe(500);
    expect(JSON.parse(response.body as string)).toMatchObject({ code: "INTERNAL" });
    expect(response.body as string).not.toContain("secret-detail");
    error.mockRestore();
  });

  it("addToCart validates sku or productId", async () => {
    const handlers = createHandlers(createMockServer());
    const response = await handlers.addToCart(jsonRequest({ anonymousId: "anon-1" }));

    expect(response.status).toBe(400);
    expect(JSON.parse(response.body as string)).toEqual({
      error: "sku or productId is required",
      code: "VALIDATION",
    });
  });

  it("express routes handle add to cart", async () => {
    const server = createMockServer();
    const app = createTestApp(createHandlers(server));

    const response = await request(app)
      .post("/cart/add")
      .send({ anonymousId: "anon-1", sku: "SHOE-RED" })
      .expect(200);

    expect(response.body).toEqual({ cart: sampleCart });
    expect(server.commercetools.addToCart).toHaveBeenCalledWith(
      expect.objectContaining({ anonymousId: "anon-1", sku: "SHOE-RED" }),
    );
  });

  it("addItemsToCart validates items", async () => {
    const handlers = createHandlers(createMockServer());
    const response = await handlers.addItemsToCart(jsonRequest({ anonymousId: "anon-1", items: [] }));

    expect(response.status).toBe(400);
    expect(JSON.parse(response.body as string)).toEqual({
      error: "items is required",
      code: "VALIDATION",
    });
  });

  it("express routes handle add items", async () => {
    const server = createMockServer();
    const app = createTestApp(createHandlers(server));

    const response = await request(app)
      .post("/cart/add-items")
      .send({ anonymousId: "anon-1", items: [{ sku: "RACKET-1", quantity: 1 }] })
      .expect(200);

    expect(response.body).toEqual({ cart: sampleCart });
    expect(server.commercetools.addItemsToCart).toHaveBeenCalledWith(
      expect.objectContaining({
        anonymousId: "anon-1",
        items: [expect.objectContaining({ sku: "RACKET-1", quantity: 1 })],
      }),
    );
  });

  it("removeFromCart returns 404 when the cart is missing", async () => {
    const server = createMockServer();
    vi.mocked(server.commercetools.removeLineItem).mockRejectedValue(new CartNotFoundError());
    const handlers = createHandlers(server);
    const response = await handlers.removeFromCart(
      jsonRequest({ anonymousId: "anon-1", lineItemId: "li-1" }),
    );

    expect(response.status).toBe(404);
    expect(JSON.parse(response.body as string)).toEqual({
      error: "Cart not found",
      code: "CART_NOT_FOUND",
    });
  });

  it("removeFromCart returns 403 when the cart belongs to another session", async () => {
    const server = createMockServer();
    vi.mocked(server.commercetools.removeLineItem).mockRejectedValue(new CartAccessDeniedError());
    const handlers = createHandlers(server);
    const response = await handlers.removeFromCart(
      jsonRequest({ anonymousId: "anon-1", lineItemId: "li-1", cartId: "cart-1" }),
    );

    expect(response.status).toBe(403);
    expect(JSON.parse(response.body as string)).toEqual({
      error: "Cart does not belong to this session",
      code: "CART_ACCESS_DENIED",
    });
  });

  it("login returns a customer session", async () => {
    const server = createMockServer();
    vi.mocked(server.commercetools.loginAndMerge).mockResolvedValue({
      customer: { id: "cust-1", email: "ada@example.com" },
      cart: sampleCart,
    });
    const handlers = createHandlers(server);
    const response = await handlers.login(
      jsonRequest({ email: "ada@example.com", password: "secret", anonymousId: "anon-1" }),
    );

    expect(response.status).toBe(200);
    const body = JSON.parse(response.body as string) as {
      customer: { id: string };
      sessionToken: string;
    };
    expect(body.customer.id).toBe("cust-1");
    expect(body.sessionToken).toEqual(expect.any(String));
  });

  it("logout clears the cart session", async () => {
    const handlers = createHandlers(createMockServer());
    const response = await handlers.logout();

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body as string)).toEqual({ cart: null, customer: null });
  });
});
