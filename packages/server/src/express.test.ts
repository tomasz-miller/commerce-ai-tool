import {
  ANONYMOUS_ID_HEADER,
  CART_SESSION_HEADER,
  InvalidCredentialsError,
  VoiceNotConfiguredError,
} from "@commerce-ai-tool/core";
import type { CartSnapshot, CommercetoolsClient, SearchOrchestrator } from "@commerce-ai-tool/core";
import { once } from "node:events";
import http from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_AUDIO_BYTES, MAX_IMAGE_BYTES, MAX_JSON_BODY_BYTES } from "./input-limits.js";
import { AI_RATE_LIMIT_MESSAGE, LOGIN_RATE_LIMIT_MESSAGE } from "./rate-limit.js";
import { signCartSession } from "./cart-session.js";
import { createExpressRouter, type ExpressRouterOptions } from "./express.js";
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
      searchByText: vi.fn(),
      searchByVoice: vi.fn(),
      searchByImage: vi.fn(),
      suggestByText: vi.fn().mockResolvedValue({ suggestions: [] }),
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
    } as unknown as CommercetoolsClient,
    cartDefaults: { currency: "EUR", catalogLocale: "en" },
    cartSessionSecret: "test-secret",
    transcribeAudio: vi.fn(),
    synthesizeSpeech: vi.fn().mockResolvedValue(Buffer.from("mp3-bytes")),
  };
}

describe("createExpressRouter behind a host body parser", () => {
  afterEach(() => {
    vi.mocked(createCommerceAIServer).mockReset();
  });

  it("uses req.body when the host already parsed it with express.json()", async () => {
    const server = createMockServer();
    vi.mocked(server.orchestrator.searchByText).mockResolvedValue({
      products: [],
      meta: { total: 0 },
    } as never);
    vi.mocked(createCommerceAIServer).mockReturnValue(server);
    const app = express();
    app.use(express.json());
    app.use(createExpressRouter({ config: {} as never }));

    const response = await request(app).post("/search").send({ query: "hat" }).timeout(3000);

    expect(response.status).toBe(200);
    expect(server.orchestrator.searchByText).toHaveBeenCalledWith(
      expect.objectContaining({ query: "hat" }),
    );
  });

  it("still enforces the 64 KB JSON cap and the object-only rule on a parsed body", async () => {
    const server = createMockServer();
    vi.mocked(createCommerceAIServer).mockReturnValue(server);
    const app = express();
    app.use(express.json({ limit: "1mb", strict: false }));
    app.use(createExpressRouter({ config: {} as never }));

    const tooLarge = await request(app)
      .post("/search")
      .send({ query: "hat", padding: "x".repeat(MAX_JSON_BODY_BYTES) })
      .timeout(3000);
    const notAnObject = await request(app)
      .post("/search")
      .set("Content-Type", "application/json")
      .send("[1]")
      .timeout(3000);

    expect(tooLarge.status).toBe(413);
    expect(notAnObject.status).toBe(400);
    expect(server.orchestrator.searchByText).not.toHaveBeenCalled();
  });
});

describe("createExpressRouter login rate limit", () => {
  afterEach(() => {
    vi.mocked(createCommerceAIServer).mockReset();
  });

  it("returns 429 after the login attempt limit", async () => {
    const server = createMockServer();
    vi.mocked(server.commercetools.loginAndMerge).mockRejectedValue(new InvalidCredentialsError());
    vi.mocked(createCommerceAIServer).mockReturnValue(server);

    const app = express();
    app.use(
      createExpressRouter({
        config: {} as never,
        loginRateLimit: { windowMs: 60_000, limit: 2 },
      }),
    );

    await request(app)
      .post("/cart/login")
      .send({ email: "ada@example.com", password: "wrong" })
      .expect(401);
    await request(app)
      .post("/cart/login")
      .send({ email: "ada@example.com", password: "wrong" })
      .expect(401);

    const limited = await request(app)
      .post("/cart/login")
      .send({ email: "ada@example.com", password: "wrong" });

    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({ error: LOGIN_RATE_LIMIT_MESSAGE, code: "RATE_LIMITED" });
    expect(limited.headers["retry-after"]).toBeDefined();
    expect(server.commercetools.loginAndMerge).toHaveBeenCalledTimes(2);
  });
});

describe("createExpressRouter cart add-items", () => {
  afterEach(() => {
    vi.mocked(createCommerceAIServer).mockReset();
  });

  it("posts multiple line items through /cart/add-items", async () => {
    const server = createMockServer();
    vi.mocked(createCommerceAIServer).mockReturnValue(server);

    const app = express();
    app.use(createExpressRouter({ config: {} as never }));

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
});

describe("createExpressRouter logout", () => {
  afterEach(() => {
    vi.mocked(createCommerceAIServer).mockReset();
  });

  it("forwards the cart session header to onLogout", async () => {
    const onLogout = vi.fn();
    const server = { ...createMockServer(), cartSessionHooks: { onLogout } };
    vi.mocked(createCommerceAIServer).mockReturnValue(server);
    const token = signCartSession({ customerId: "cust-1" }, "test-secret");

    const app = express();
    app.use(createExpressRouter({ config: {} as never }));

    const response = await request(app)
      .post("/cart/logout")
      .set(CART_SESSION_HEADER, token)
      .expect(200);

    expect(response.body).toEqual({ cart: null, customer: null });
    expect(onLogout).toHaveBeenCalledWith(expect.objectContaining({ customerId: "cust-1" }));
  });
});

describe("createExpressRouter AI rate limit, key generation and content type", () => {
  afterEach(() => {
    vi.mocked(createCommerceAIServer).mockReset();
    vi.restoreAllMocks();
  });

  function setup(options: Partial<ExpressRouterOptions> = {}, configure?: (app: express.Express) => void) {
    const server = createMockServer();
    vi.mocked(createCommerceAIServer).mockReturnValue(server);
    const app = express();
    configure?.(app);
    app.use(createExpressRouter({ config: {} as never, ...options }));
    return { server, app };
  }

  it("applies aiRateLimit to /tts", async () => {
    const { server, app } = setup({ aiRateLimit: { windowMs: 60_000, limit: 1 } });

    await request(app).post("/tts").send({ text: "hello" }).expect(200);
    const limited = await request(app).post("/tts").send({ text: "hello" });

    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({ error: AI_RATE_LIMIT_MESSAGE, code: "RATE_LIMITED" });
    expect(limited.headers["retry-after"]).toBe("60");
    expect(server.synthesizeSpeech).toHaveBeenCalledTimes(1);
  });

  it("shares the AI bucket across search, voice, image and tts", async () => {
    const { app } = setup({ aiRateLimit: { limit: 1 } });

    await request(app).post("/tts").send({ text: "hello" }).expect(200);
    await request(app).post("/search").send({ query: "hat" }).expect(429);
    await request(app).post("/search/voice").attach("audio", Buffer.from("x"), "a.webm").expect(429);
    await request(app).post("/search/image").attach("image", Buffer.from("x"), "a.png").expect(429);
  });

  it("limits suggestions in a separate bucket that aiRateLimit: false disables", async () => {
    const limited = setup({ aiRateLimit: { limit: 1 } }).app;
    await request(limited).post("/tts").send({ text: "hello" }).expect(200);
    await request(limited).post("/search/suggestions").send({ query: "red" }).expect(200);

    const unlimited = setup({ aiRateLimit: false }).app;
    for (let i = 0; i < 35; i += 1) {
      await request(unlimited).post("/tts").send({ text: "hello" }).expect(200);
    }
  });

  it("rejects malformed searchTerms with 400 VALIDATION", async () => {
    const { server, app } = setup();

    for (const searchTerms of [[1], "red shoes", Array.from({ length: 21 }, () => "x")]) {
      const response = await request(app).post("/search").send({ query: "hat", searchTerms });
      expect(response.status).toBe(400);
      expect(response.body.code).toBe("VALIDATION");
    }
    expect(server.orchestrator.searchByText).not.toHaveBeenCalled();
  });

  it("applies suggestionsRateLimit to /search/suggestions independently of aiRateLimit", async () => {
    const { app } = setup({ aiRateLimit: { limit: 100 }, suggestionsRateLimit: { limit: 1 } });

    await request(app).post("/search/suggestions").send({ query: "red" }).expect(200);
    const limited = await request(app).post("/search/suggestions").send({ query: "red" });
    expect(limited.status).toBe(429);
    expect(limited.body.code).toBe("RATE_LIMITED");
    await request(app).post("/search").send({ query: "hat" }).expect(200);
  });

  it("suggestionsRateLimit: false disables only the suggestions limiter", async () => {
    const { app } = setup({ aiRateLimit: { limit: 1 }, suggestionsRateLimit: false });

    for (let i = 0; i < 125; i += 1) {
      await request(app).post("/search/suggestions").send({ query: "red" }).expect(200);
    }
  });

  it("uses express-rate-limit's default key generator and proxy validation", async () => {
    const errors: unknown[] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      errors.push(...args);
    });
    const { app } = setup();

    await request(app).post("/tts").set("X-Forwarded-For", "203.0.113.7").send({ text: "hello" }).expect(200);

    expect(errors).toContainEqual(
      expect.objectContaining({ code: "ERR_ERL_UNEXPECTED_X_FORWARDED_FOR" }),
    );
  });

  it("keys on the client IP when trust proxy is set", async () => {
    const { app } = setup({ aiRateLimit: { limit: 1 } }, (a) => a.set("trust proxy", 1));

    await request(app).post("/tts").set("X-Forwarded-For", "203.0.113.1").send({ text: "a" }).expect(200);
    await request(app).post("/tts").set("X-Forwarded-For", "203.0.113.2").send({ text: "a" }).expect(200);
    await request(app).post("/tts").set("X-Forwarded-For", "203.0.113.1").send({ text: "a" }).expect(429);
  });

  it("uses a host keyGenerator and masks IPv6 keys to a subnet", async () => {
    const keyGenerator = vi.fn((req: express.Request) => String(req.headers["x-client"]));
    const { app } = setup({ aiRateLimit: { limit: 1 }, keyGenerator });

    await request(app).post("/tts").set("X-Client", "tenant-a").send({ text: "a" }).expect(200);
    await request(app).post("/tts").set("X-Client", "tenant-b").send({ text: "a" }).expect(200);
    await request(app).post("/tts").set("X-Client", "tenant-a").send({ text: "a" }).expect(429);

    // Two addresses in the same /56 share a bucket.
    await request(app).post("/tts").set("X-Client", "2001:db8:0:1::1").send({ text: "a" }).expect(200);
    await request(app).post("/tts").set("X-Client", "2001:db8:0:2::1").send({ text: "a" }).expect(429);
    expect(keyGenerator).toHaveBeenCalled();
  });

  it("rejects a JSON route with Content-Type text/plain with 415", async () => {
    const { server, app } = setup();

    const response = await request(app)
      .post("/search")
      .set("Content-Type", "text/plain")
      .send(JSON.stringify({ query: "hat" }));

    expect(response.status).toBe(415);
    expect(response.body).toEqual({
      error: "Content-Type must be application/json",
      code: "UNSUPPORTED_MEDIA_TYPE",
    });
    expect(server.orchestrator.searchByText).not.toHaveBeenCalled();
  });

  it("rejects cart and login bodies without a JSON Content-Type", async () => {
    const { server, app } = setup();

    await request(app)
      .post("/cart/add")
      .set("Content-Type", "text/plain")
      .send(JSON.stringify({ anonymousId: "anon-1", sku: "S" }))
      .expect(415);
    await request(app)
      .post("/cart/login")
      .set("Content-Type", "text/plain")
      .send(JSON.stringify({ email: "ada@example.com", password: "x" }))
      .expect(415);

    expect(server.commercetools.addToCart).not.toHaveBeenCalled();
    expect(server.commercetools.loginAndMerge).not.toHaveBeenCalled();
  });

  it("accepts application/json; charset=utf-8", async () => {
    const { app } = setup();

    await request(app)
      .post("/tts")
      .set("Content-Type", "application/json; charset=utf-8")
      .send(JSON.stringify({ text: "hello" }))
      .expect(200);
  });

  it("does not require JSON on multipart routes", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { app } = setup();

    const response = await request(app).post("/search/image").field("limit", "5");
    expect(response.status).not.toBe(415);
  });

  it("login is limited per email hash even when client keys rotate", async () => {
    const { server, app } = setup({}, (a) => a.set("trust proxy", 1));
    vi.mocked(server.commercetools.loginAndMerge).mockRejectedValue(new InvalidCredentialsError());

    for (let i = 0; i < 10; i += 1) {
      await request(app)
        .post("/cart/login")
        .set("X-Forwarded-For", `198.51.100.${i}`)
        .send({ email: "ada@example.com", password: "wrong" })
        .expect(401);
    }

    const limited = await request(app)
      .post("/cart/login")
      .set("X-Forwarded-For", "198.51.100.200")
      .send({ email: "ADA@example.com", password: "wrong" });

    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({ error: LOGIN_RATE_LIMIT_MESSAGE, code: "RATE_LIMITED" });
    expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0);
    expect(server.commercetools.loginAndMerge).toHaveBeenCalledTimes(10);
  });

  it("successful logins do not consume the email bucket", async () => {
    const { server, app } = setup({}, (a) => a.set("trust proxy", 1));
    vi.mocked(server.commercetools.loginAndMerge).mockResolvedValue({
      customer: { id: "cust-1", email: "ada@example.com" },
      cart: sampleCart,
    });

    for (let i = 0; i < 15; i += 1) {
      await request(app)
        .post("/cart/login")
        .set("X-Forwarded-For", `198.51.100.${i}`)
        .send({ email: "ada@example.com", password: "right" })
        .expect(200);
    }
  });

  it("10 failed logins for one email block the 11th attempt even with the correct password", async () => {
    const { server, app } = setup({}, (a) => a.set("trust proxy", 1));
    vi.mocked(server.commercetools.loginAndMerge).mockRejectedValue(new InvalidCredentialsError());

    for (let i = 0; i < 10; i += 1) {
      await request(app)
        .post("/cart/login")
        .set("X-Forwarded-For", `198.51.100.${i}`)
        .send({ email: "ada@example.com", password: "wrong" })
        .expect(401);
    }

    vi.mocked(server.commercetools.loginAndMerge).mockResolvedValue({
      customer: { id: "cust-1", email: "ada@example.com" },
      cart: sampleCart,
    });
    const blocked = await request(app)
      .post("/cart/login")
      .set("X-Forwarded-For", "198.51.100.99")
      .send({ email: "ada@example.com", password: "right" });

    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ error: LOGIN_RATE_LIMIT_MESSAGE, code: "RATE_LIMITED" });

    const other = await request(app)
      .post("/cart/login")
      .set("X-Forwarded-For", "198.51.100.98")
      .send({ email: "grace@example.com", password: "right" });
    expect(other.status).toBe(200);
  });

  it("parallel failed logins never exceed the limit", async () => {
    const { server, app } = setup({}, (a) => a.set("trust proxy", 1));
    vi.mocked(server.commercetools.loginAndMerge).mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      throw new InvalidCredentialsError();
    });

    const responses = await Promise.all(
      Array.from({ length: 15 }, (_, i) =>
        request(app)
          .post("/cart/login")
          .set("X-Forwarded-For", `198.51.100.${i}`)
          .send({ email: "ada@example.com", password: "wrong" }),
      ),
    );
    const statuses = responses.map((response) => response.status);

    expect(server.commercetools.loginAndMerge).toHaveBeenCalledTimes(10);
    expect(statuses.filter((status) => status === 401)).toHaveLength(10);
    expect(statuses.filter((status) => status === 429)).toHaveLength(5);
  });

  it("a 5xx from loginAndMerge does not consume the email bucket", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { server, app } = setup({}, (a) => a.set("trust proxy", 1));
    vi.mocked(server.commercetools.loginAndMerge).mockRejectedValue(new Error("upstream 503"));

    for (let i = 0; i < 12; i += 1) {
      await request(app)
        .post("/cart/login")
        .set("X-Forwarded-For", `198.51.100.${i}`)
        .send({ email: "ada@example.com", password: "right" })
        .expect(500);
    }

    vi.mocked(server.commercetools.loginAndMerge).mockResolvedValue({
      customer: { id: "cust-1", email: "ada@example.com" },
      cart: sampleCart,
    });
    await request(app)
      .post("/cart/login")
      .set("X-Forwarded-For", "198.51.100.99")
      .send({ email: "ada@example.com", password: "right" })
      .expect(200);
  });

  it("413 for an image over MAX_IMAGE_BYTES and never reaches the orchestrator", async () => {
    const { server, app } = setup();

    const response = await request(app)
      .post("/search/image")
      .attach("image", Buffer.alloc(MAX_IMAGE_BYTES + 1), { filename: "a.jpg", contentType: "image/jpeg" });

    expect(response.status).toBe(413);
    expect(response.body.code).toBe("PAYLOAD_TOO_LARGE");
    expect(server.orchestrator.searchByImage).not.toHaveBeenCalled();
  });

  it("415 for an image/gif upload", async () => {
    const { server, app } = setup();

    const response = await request(app)
      .post("/search/image")
      .attach("image", Buffer.alloc(16), { filename: "a.gif", contentType: "image/gif" });

    expect(response.status).toBe(415);
    expect(response.body.code).toBe("UNSUPPORTED_MEDIA_TYPE");
    expect(server.orchestrator.searchByImage).not.toHaveBeenCalled();
  });

  it("415 for an unsupported voice upload and 413 for an oversized one", async () => {
    const { server, app } = setup();

    const unsupported = await request(app)
      .post("/search/voice")
      .attach("audio", Buffer.alloc(16), { filename: "a.txt", contentType: "text/plain" });
    const oversized = await request(app)
      .post("/search/voice")
      .attach("audio", Buffer.alloc(MAX_AUDIO_BYTES + 1), { filename: "a.webm", contentType: "audio/webm" });

    expect(unsupported.status).toBe(415);
    expect(unsupported.body.code).toBe("UNSUPPORTED_MEDIA_TYPE");
    expect(oversized.status).toBe(413);
    expect(oversized.body.code).toBe("PAYLOAD_TOO_LARGE");
    expect(server.orchestrator.searchByVoice).not.toHaveBeenCalled();
  });

  it("413 for a JSON body over 64 KB", async () => {
    const { server, app } = setup();

    const response = await request(app)
      .post("/search")
      .send({ query: "hat", padding: "x".repeat(MAX_JSON_BODY_BYTES) });

    expect(response.status).toBe(413);
    expect(response.body.code).toBe("PAYLOAD_TOO_LARGE");
    expect(server.orchestrator.searchByText).not.toHaveBeenCalled();
  });

  it("503 UPSTREAM_UNAVAILABLE when voice search has no STT backend", async () => {
    const { server, app } = setup();
    vi.mocked(server.orchestrator.searchByVoice).mockRejectedValue(new VoiceNotConfiguredError());

    const response = await request(app)
      .post("/search/voice")
      .attach("audio", Buffer.alloc(16), { filename: "a.webm", contentType: "audio/webm" });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: "Voice service is not configured",
      code: "UPSTREAM_UNAVAILABLE",
    });
  });
});

describe("createExpressRouter guest identity header", () => {
  afterEach(() => {
    vi.mocked(createCommerceAIServer).mockReset();
  });

  it("CORS preflight allows the anonymous id header and GET /cart reads it", async () => {
    const server = createMockServer();
    vi.mocked(createCommerceAIServer).mockReturnValue(server);
    const app = express();
    app.use(createExpressRouter({ config: {} as never, corsOrigins: "https://shop.example" }));

    const preflight = await request(app)
      .options("/cart")
      .set("Origin", "https://shop.example")
      .set("Access-Control-Request-Method", "GET")
      .set("Access-Control-Request-Headers", `${ANONYMOUS_ID_HEADER},${CART_SESSION_HEADER}`);
    expect(preflight.status).toBe(204);
    expect(preflight.headers["access-control-allow-headers"]).toContain(ANONYMOUS_ID_HEADER);
    expect(preflight.headers["access-control-allow-headers"]).toContain(CART_SESSION_HEADER);

    await request(app).get("/cart").set(ANONYMOUS_ID_HEADER, "anon-1").expect(200);
    expect(server.commercetools.getCart).toHaveBeenCalledWith("anon-1", "en");
  });
});

describe("createExpressRouter Langfuse flush", () => {
  afterEach(() => {
    vi.mocked(createCommerceAIServer).mockReset();
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    registerLangfuseFlush(null);
    vi.restoreAllMocks();
  });

  it("flushes after the response has finished and does not wait for the export", async () => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk";
    process.env.LANGFUSE_SECRET_KEY = "sk";
    const server = createMockServer();
    vi.mocked(server.orchestrator.searchByText).mockResolvedValue({ products: [], meta: { total: 0 } } as never);
    vi.mocked(createCommerceAIServer).mockReturnValue(server);

    let currentRes: express.Response | undefined;
    const finishedAtFlush: boolean[] = [];
    // A flush that never settles: the response must not wait for it.
    const flush = vi.fn(() => {
      finishedAtFlush.push(Boolean(currentRes?.writableFinished));
      return new Promise<void>(() => undefined);
    });
    registerLangfuseFlush(flush);

    const app = express();
    app.use((_req, res, next) => {
      currentRes = res;
      next();
    });
    app.use(createExpressRouter({ config: {} as never }));

    const response = await request(app).post("/search").send({ query: "hat" });

    expect(response.status).toBe(200);
    await vi.waitFor(() => expect(flush).toHaveBeenCalledOnce());
    expect(finishedAtFlush).toEqual([true]);
  });

  it("flushes when the client aborted before the flush was scheduled", async () => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk";
    process.env.LANGFUSE_SECRET_KEY = "sk";
    const server = createMockServer();
    let releaseAi: (() => void) | undefined;
    vi.mocked(server.orchestrator.searchByText).mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseAi = () => resolve({ products: [], meta: { total: 0 } } as never);
        }),
    );
    vi.mocked(createCommerceAIServer).mockReturnValue(server);
    const flush = vi.fn().mockResolvedValue(undefined);
    registerLangfuseFlush(flush);

    const app = express();
    app.use(createExpressRouter({ config: {} as never }));
    const httpServer = app.listen(0);
    try {
      await once(httpServer, "listening");
      const { port } = httpServer.address() as AddressInfo;
      const body = JSON.stringify({ query: "hat" });
      const clientReq = http.request({
        port,
        method: "POST",
        path: "/search",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      });
      clientReq.on("error", () => undefined);
      clientReq.end(body);

      await vi.waitFor(() => expect(releaseAi).toBeDefined());
      clientReq.destroy();
      // The socket close reaches the server before the AI call settles.
      await new Promise((resolve) => setTimeout(resolve, 100));
      releaseAi?.();

      await vi.waitFor(() => expect(flush).toHaveBeenCalledOnce());
    } finally {
      httpServer.close();
    }
  });

  it("aborts the orchestrator signal when the client disconnects, not when the body is read", async () => {
    const server = createMockServer();
    let seenSignal: AbortSignal | undefined;
    let abortedBeforeDisconnect: boolean | undefined;
    vi.mocked(server.orchestrator.searchByText).mockImplementation(
      (searchRequest) =>
        new Promise(() => {
          seenSignal = searchRequest.signal;
        }),
    );
    vi.mocked(createCommerceAIServer).mockReturnValue(server);

    const app = express();
    app.use(createExpressRouter({ config: {} as never, aiRateLimit: false }));
    const httpServer = app.listen(0);
    try {
      await once(httpServer, "listening");
      const { port } = httpServer.address() as AddressInfo;
      const body = JSON.stringify({ query: "hat" });
      const clientReq = http.request({
        port,
        method: "POST",
        path: "/search",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      });
      clientReq.on("error", () => undefined);
      clientReq.end(body);

      await vi.waitFor(() => expect(seenSignal).toBeDefined());
      // The request body has been fully consumed here; the signal must still be live.
      await new Promise((resolve) => setTimeout(resolve, 50));
      abortedBeforeDisconnect = seenSignal?.aborted;
      clientReq.destroy();

      await vi.waitFor(() => expect(seenSignal?.aborted).toBe(true));
      expect(abortedBeforeDisconnect).toBe(false);
    } finally {
      httpServer.close();
    }
  });

  it("does not abort the signal after a completed response", async () => {
    const server = createMockServer();
    let seenSignal: AbortSignal | undefined;
    vi.mocked(server.orchestrator.searchByText).mockImplementation((searchRequest) => {
      seenSignal = searchRequest.signal;
      return Promise.resolve({ products: [], meta: { total: 0 } } as never);
    });
    vi.mocked(createCommerceAIServer).mockReturnValue(server);
    const app = express();
    app.use(createExpressRouter({ config: {} as never, aiRateLimit: false }));

    await request(app).post("/search").send({ query: "hat" }).expect(200);

    expect(seenSignal).toBeInstanceOf(AbortSignal);
    expect(seenSignal?.aborted).toBe(false);
  });

  it("does not fail the response when the flush rejects", async () => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk";
    process.env.LANGFUSE_SECRET_KEY = "sk";
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.mocked(createCommerceAIServer).mockReturnValue(createMockServer());
    const flush = vi.fn().mockRejectedValue(new Error("BatchSpanProcessor: span export failed"));
    registerLangfuseFlush(flush);

    const app = express();
    app.use(createExpressRouter({ config: {} as never }));

    await request(app).post("/tts").send({ text: "hello" }).expect(200);
    await vi.waitFor(() => expect(flush).toHaveBeenCalledOnce());
  });
});
