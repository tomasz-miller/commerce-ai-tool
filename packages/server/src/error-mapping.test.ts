import { readdirSync, readFileSync } from "node:fs";
import { EventEmitter, once } from "node:events";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { PassThrough } from "node:stream";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AIOutputTruncatedError,
  AIRateLimitedError,
  AIUpstreamError,
  CartAccessDeniedError,
  CartNotFoundError,
  CheckoutIncompleteError,
  CountryNotAllowedError,
  CurrencyMismatchError,
  InvalidCredentialsError,
  MissingPriceError,
  OrderNotFoundError,
  PaymentDeclinedError,
  PaymentNotConfiguredError,
  ProductSearchUnavailableError,
  SearchTimeoutError,
  UnsupportedAudioTypeError,
  VoiceNotConfiguredError,
} from "@commerce-ai-tool/core";
import type {
  ApiErrorCode,
  CartSnapshot,
  CommerceAIConfig,
  CommercetoolsClient,
  SearchOrchestrator,
} from "@commerce-ai-tool/core";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { InvalidCartSessionError } from "./cart-session.js";
import { HttpError, ValidationError } from "./errors.js";
import { createExpressRouter } from "./express.js";
import { createNextRouteHandler, type NextRouteContext } from "./next-route.js";
import { TooManyRequestsError } from "./rate-limit.js";
import { mapRouteError } from "./route-actions.js";
import type { CommerceAIServer } from "./server.js";

vi.mock("./server.js", () => ({
  createCommerceAIServer: vi.fn(),
}));

import { createCommerceAIServer } from "./server.js";

/** Marker planted in every error that must not reach the client verbatim. */
const SECRET = "SECRET-provider-detail";

interface ErrorCase {
  /** Class name; the completeness guard below matches it against the source tree. */
  name: string;
  make: () => unknown;
  status: number;
  code: ApiErrorCode;
  /** Set when the client sees this fixed string instead of the error's own message. */
  maskedMessage?: string;
  /** Response headers the route must set (lower-case names). */
  headers?: Record<string, string>;
  /** Route that raises the error; `search` unless the row needs a route-specific behaviour. */
  via?: "login";
}

/**
 * One row per error class that can reach a route. `mapRouteError` is the single mapping used by
 * every handler, the Express router and both Next adapters.
 */
const ERROR_CASES: ErrorCase[] = [
  { name: "ValidationError", make: () => new ValidationError("query is required"), status: 400, code: "VALIDATION" },
  {
    name: "HttpError (413)",
    make: () => new HttpError(413, "PAYLOAD_TOO_LARGE", "Request body must be at most 64 KB"),
    status: 413,
    code: "PAYLOAD_TOO_LARGE",
  },
  {
    name: "HttpError (415)",
    make: () => new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json"),
    status: 415,
    code: "UNSUPPORTED_MEDIA_TYPE",
  },
  {
    name: "HttpError (503)",
    make: () => new HttpError(503, "UPSTREAM_UNAVAILABLE", "Facet schema is not available"),
    status: 503,
    code: "UPSTREAM_UNAVAILABLE",
  },
  {
    name: "UnsupportedAudioTypeError",
    make: () => new UnsupportedAudioTypeError(`audio/${SECRET}`),
    status: 415,
    code: "UNSUPPORTED_MEDIA_TYPE",
    maskedMessage: "Unsupported audio type",
  },
  {
    name: "VoiceNotConfiguredError",
    make: () => new VoiceNotConfiguredError(),
    status: 503,
    code: "UPSTREAM_UNAVAILABLE",
    maskedMessage: "Voice service is not configured",
  },
  {
    name: "SearchTimeoutError",
    make: () => new SearchTimeoutError("interpret", 8000),
    status: 504,
    code: "TIMEOUT",
  },
  {
    name: "AIRateLimitedError",
    make: () => new AIRateLimitedError({ cause: new Error(SECRET) }),
    status: 429,
    code: "RATE_LIMITED",
    maskedMessage: "The AI service is busy, try again shortly",
  },
  {
    name: "AIUpstreamError",
    make: () => new AIUpstreamError(502, { cause: new Error(SECRET) }),
    status: 503,
    code: "UPSTREAM_UNAVAILABLE",
    maskedMessage: "The AI service is unavailable",
  },
  {
    name: "AIOutputTruncatedError",
    make: () => new AIOutputTruncatedError("interpret", `model-${SECRET}`),
    status: 503,
    code: "UPSTREAM_UNAVAILABLE",
    maskedMessage: "The AI service returned an incomplete answer",
  },
  {
    name: "CountryNotAllowedError",
    make: () => new CountryNotAllowedError(`country ${SECRET}`),
    status: 400,
    code: "VALIDATION",
    maskedMessage: "Shipping country is not allowed",
  },
  {
    name: "CurrencyMismatchError",
    make: () => new CurrencyMismatchError(`currency ${SECRET}`),
    status: 400,
    code: "VALIDATION",
    maskedMessage: "The cart currency does not match the shipping country",
  },
  {
    name: "CheckoutIncompleteError",
    make: () => new CheckoutIncompleteError("Shipping address is required"),
    status: 400,
    code: "CHECKOUT_INCOMPLETE",
  },
  {
    name: "MissingPriceError",
    make: () => new MissingPriceError(`no price for ${SECRET}`),
    status: 400,
    code: "MISSING_PRICE",
    maskedMessage: "No matching price for this cart currency and country",
  },
  {
    name: "PaymentDeclinedError",
    make: () => new PaymentDeclinedError(`PSP says ${SECRET}`),
    status: 402,
    code: "PAYMENT_DECLINED",
    maskedMessage: "Payment was declined",
  },
  {
    name: "PaymentNotConfiguredError",
    make: () => new PaymentNotConfiguredError(),
    status: 400,
    code: "PAYMENT_NOT_CONFIGURED",
  },
  {
    name: "ProductSearchUnavailableError",
    make: () => new ProductSearchUnavailableError(`Product Search API is not enabled for "${SECRET}"`),
    status: 503,
    code: "UPSTREAM_UNAVAILABLE",
    maskedMessage: "Product search is not available",
  },
  { name: "CartNotFoundError", make: () => new CartNotFoundError(), status: 404, code: "CART_NOT_FOUND" },
  { name: "OrderNotFoundError", make: () => new OrderNotFoundError(), status: 404, code: "ORDER_NOT_FOUND" },
  {
    name: "CartAccessDeniedError",
    make: () => new CartAccessDeniedError(),
    status: 403,
    code: "CART_ACCESS_DENIED",
  },
  {
    name: "InvalidCredentialsError",
    make: () => new InvalidCredentialsError(),
    status: 401,
    code: "INVALID_CREDENTIALS",
  },
  {
    name: "InvalidCartSessionError",
    make: () => new InvalidCartSessionError(),
    status: 401,
    code: "SESSION_INVALID",
  },
  {
    name: "TooManyRequestsError",
    make: () => new TooManyRequestsError(30),
    status: 429,
    code: "RATE_LIMITED",
    // Only the login route sets Retry-After from the limiter's error.
    headers: { "retry-after": "30" },
    via: "login",
  },
  {
    name: "AbortError",
    make: () => new DOMException(`aborted ${SECRET}`, "AbortError"),
    status: 499,
    code: "INTERNAL",
    maskedMessage: "Request aborted",
  },
  {
    name: "unknown Error",
    make: () => new Error(`ECONNRESET ${SECRET}`),
    status: 500,
    code: "INTERNAL",
    maskedMessage: "Search failed",
  },
  { name: "non-Error throw", make: () => `boom ${SECRET}`, status: 500, code: "INTERNAL", maskedMessage: "Search failed" },
];

const FALLBACK = "Search failed";

/** Two macrotask turns: enough for promise continuations and queued stream events to run. */
async function ticks(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

describe("error mapping table", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("covers every Error subclass in the core and server sources", () => {
    const root = fileURLToPath(new URL("../../", import.meta.url));
    const found = new Set<string>();
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(path);
        } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
          for (const match of readFileSync(path, "utf8").matchAll(/class (\w+)\s+extends\s+(?:\w*Error|HttpError)\b/g)) {
            found.add(match[1] as string);
          }
        }
      }
    };
    walk(join(root, "core/src"));
    walk(join(root, "server/src"));
    // A broken scan (moved sources, changed regex) must not pass as "nothing to cover".
    expect(found.size).toBeGreaterThan(15);

    // `CommerceAIApiError` is thrown by the browser client, never by a route.
    found.delete("CommerceAIApiError");
    // `HttpError` is the base class, covered by its status variants.
    const covered = new Set(ERROR_CASES.map((entry) => entry.name.replace(/ \(\d+\)$/, "")));
    expect([...found].filter((name) => !covered.has(name))).toEqual([]);
  });

  it("every row builds the error class it names", () => {
    for (const entry of ERROR_CASES) {
      const error = entry.make();
      const base = entry.name.replace(/ \(\d+\)$/, "");
      if (base === "AbortError") {
        expect((error as Error).name, entry.name).toBe(base);
      } else if (error instanceof Error && /^[A-Z]\w*Error$/.test(base)) {
        expect(error.constructor.name, entry.name).toBe(base);
      } else if (base === "HttpError") {
        expect(error, entry.name).toBeInstanceOf(HttpError);
        expect((error as HttpError).status, entry.name).toBe(entry.status);
      }
    }
  });

  it.each(ERROR_CASES)("mapRouteError: $name -> $status $code", (entry) => {
    const mapped = mapRouteError(entry.make(), "search", FALLBACK);

    expect(mapped.status).toBe(entry.status);
    expect(mapped.code).toBe(entry.code);
    expect(mapped.message).toBe(entry.maskedMessage ?? (entry.make() as Error).message);
    expect(mapped.message).not.toContain(SECRET);
  });
});

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
      suggestByText: vi.fn(),
    } as unknown as SearchOrchestrator,
    commercetools: {
      getCart: vi.fn().mockResolvedValue(sampleCart),
      addToCart: vi.fn().mockResolvedValue(sampleCart),
      loginAndMerge: vi.fn(),
    } as unknown as CommercetoolsClient,
    cartDefaults: { currency: "EUR", catalogLocale: "en" },
    cartSessionSecret: "test-secret",
    transcribeAudio: vi.fn(),
    synthesizeSpeech: vi.fn(),
  };
}

const CONFIG = {} as CommerceAIConfig;

function ctx(...path: string[]): NextRouteContext {
  return { params: Promise.resolve({ path }) };
}

function assertResponse(
  entry: ErrorCase,
  status: number,
  headers: (name: string) => string | null | undefined,
  rawBody: string,
) {
  expect(status).toBe(entry.status);
  expect(headers("content-type")).toMatch(/^application\/json/);
  for (const [name, value] of Object.entries(entry.headers ?? {})) {
    expect(headers(name), name).toBe(value);
  }
  const body = JSON.parse(rawBody) as Record<string, unknown>;
  expect(Object.keys(body).sort()).toEqual(["code", "error"]);
  expect(body.code).toBe(entry.code);
  expect(body.error).toBe(entry.maskedMessage ?? (entry.make() as Error).message);
  expect(rawBody).not.toContain(SECRET);
}

/** Mocks the failing call and returns the request every transport sends for the row. */
function arrangeRoute(entry: ErrorCase, server: CommerceAIServer) {
  if (entry.via === "login") {
    vi.mocked(server.commercetools.loginAndMerge).mockRejectedValue(entry.make());
    return { path: "/cart/login", segments: ["cart", "login"], body: { email: "shopper@example.test", password: "pw" } };
  }
  vi.mocked(server.orchestrator.searchByText).mockRejectedValue(entry.make());
  return { path: "/search", segments: ["search"], body: { query: "hat" } };
}

describe("error mapping over HTTP", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.mocked(createCommerceAIServer).mockReset();
    vi.restoreAllMocks();
  });

  describe("Express router", () => {
    it.each(ERROR_CASES)("$name -> $status $code", async (entry) => {
      const server = createMockServer();
      const route = arrangeRoute(entry, server);
      vi.mocked(createCommerceAIServer).mockReturnValue(server);
      const app = express();
      app.use(createExpressRouter({ config: CONFIG, aiRateLimit: false, loginRateLimit: false }));

      const response = await request(app).post(route.path).send(route.body);

      assertResponse(entry, response.status, (name) => response.headers[name], response.text);
    });
  });

  describe("Next catch-all", () => {
    it.each(ERROR_CASES)("$name -> $status $code", async (entry) => {
      const server = createMockServer();
      const route = arrangeRoute(entry, server);
      vi.mocked(createCommerceAIServer).mockReturnValue(server);
      const { POST } = createNextRouteHandler(CONFIG, { aiRateLimit: false, loginRateLimit: false });

      const response = await POST(
        new Request(`http://localhost/api/commerce-ai${route.path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(route.body),
        }),
        ctx(...route.segments),
      );

      assertResponse(entry, response.status, (name) => response.headers.get(name), await response.text());
    });
  });
});

describe("a JSON request body that errors mid-read", () => {
  let uncaught: Mock<(error: Error) => void>;

  beforeEach(() => {
    uncaught = vi.fn<(error: Error) => void>();
    process.on("uncaughtException", uncaught);
  });

  afterEach(() => {
    process.off("uncaughtException", uncaught);
    vi.mocked(createCommerceAIServer).mockReset();
    vi.restoreAllMocks();
  });

  const settle = <T>(promise: Promise<T>): Promise<T> =>
    Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        setTimeout(() => reject(new Error("request never settled")), 2000);
      }),
    ]);

  describe("Next catch-all", () => {
    function interruptedJson(path: string, signal?: AbortSignal): Request {
      const encoder = new TextEncoder();
      let pulled = false;
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (!pulled) {
            pulled = true;
            controller.enqueue(encoder.encode('{"query":"ha'));
            return;
          }
          controller.error(new Error("client went away"));
        },
      });
      return new Request(`http://localhost/api/commerce-ai${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        duplex: "half",
        signal,
      } as RequestInit);
    }

    it.each([
      ["/search", ["search"]],
      ["/cart/add", ["cart", "add"]],
    ])("%s answers 400 when the stream fails without an abort", async (path, segments) => {
      const server = createMockServer();
      vi.mocked(createCommerceAIServer).mockReturnValue(server);
      const { POST } = createNextRouteHandler(CONFIG, { aiRateLimit: false });

      const response = await settle(POST(interruptedJson(path), ctx(...(segments as string[]))));

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ code: "VALIDATION" });
      await ticks();
      expect(uncaught).not.toHaveBeenCalled();
      expect(server.orchestrator.searchByText).not.toHaveBeenCalled();
      expect(server.commercetools.addToCart).not.toHaveBeenCalled();
    });

    it("answers 499 when the client aborted", async () => {
      const server = createMockServer();
      vi.mocked(createCommerceAIServer).mockReturnValue(server);
      const { POST } = createNextRouteHandler(CONFIG, { aiRateLimit: false });
      const client = new AbortController();
      const pending = POST(interruptedJson("/search", client.signal), ctx("search"));
      client.abort();

      const response = await settle(pending);

      expect(response.status).toBe(499);
      await ticks();
      expect(uncaught).not.toHaveBeenCalled();
      expect(server.orchestrator.searchByText).not.toHaveBeenCalled();
    });
  });

  describe("Express router", () => {
    /** Just the parts of a ServerResponse the router touches; `send` records what it answers. */
    class FakeResponse extends EventEmitter {
      statusCode = 200;
      destroyed = false;
      writableFinished = false;
      closed = false;
      readonly sent: Array<{ status: number; body: string }> = [];
      setHeader(): void {}
      status(code: number): this {
        this.statusCode = code;
        return this;
      }
      send(body: unknown): this {
        this.sent.push({ status: this.statusCode, body: String(body) });
        return this;
      }
    }

    /** Starts a JSON POST on the router with a body that has begun but never finishes. */
    async function startRequest(path: string) {
      const server = createMockServer();
      vi.mocked(createCommerceAIServer).mockReturnValue(server);
      const router = createExpressRouter({ config: CONFIG, aiRateLimit: false });
      const req = Object.assign(new PassThrough(), {
        method: "POST",
        url: path,
        originalUrl: path,
        headers: { "content-type": "application/json", "content-length": "200" },
      });
      const res = new FakeResponse();
      router(req as never, res as never, () => {
        throw new Error("route not matched");
      });
      req.write('{"query":"ha');
      await ticks();
      return { req, res, server };
    }

    const interrupt = (req: PassThrough) => req.emit("error", new Error("aborted"));

    it("answers 400 when the stream fails and the connection is still open", async () => {
      const { req, res, server } = await startRequest("/search");

      interrupt(req);
      await ticks();

      expect(res.sent).toHaveLength(1);
      expect(res.sent[0]?.status).toBe(400);
      expect(JSON.parse(res.sent[0]?.body ?? "{}")).toMatchObject({ code: "VALIDATION" });
      expect(server.orchestrator.searchByText).not.toHaveBeenCalled();
    });

    it("answers 499 on an AI route when the connection closed before the stream error", async () => {
      const { req, res, server } = await startRequest("/search");

      res.emit("close");
      interrupt(req);
      await ticks();

      expect(res.sent).toHaveLength(1);
      expect(res.sent[0]?.status).toBe(499);
      expect(server.orchestrator.searchByText).not.toHaveBeenCalled();
    });

    it("keeps the 400 when the connection only closes after the stream error was answered", async () => {
      const { req, res } = await startRequest("/search");

      interrupt(req);
      await ticks();
      res.emit("close");
      await ticks();

      expect(res.sent).toHaveLength(1);
      expect(res.sent[0]?.status).toBe(400);
    });

    it("answers 400 on a route without an abort signal even if the connection closed first", async () => {
      const { req, res, server } = await startRequest("/cart/add");

      res.emit("close");
      interrupt(req);
      await ticks();

      expect(res.sent).toHaveLength(1);
      expect(res.sent[0]?.status).toBe(400);
      expect(server.commercetools.addToCart).not.toHaveBeenCalled();
    });

    describe("over a real socket", () => {
      /**
       * Sends the head of a JSON body, then destroys the socket. The client never sees the
       * reply, so only the status the router tried to send is recorded (by wrapping `res.send`).
       * Whether the router saw the stream error or the close first is up to the OS, so the
       * exact status is pinned by the fake-stream tests above.
       */
      it.each(["/search", "/cart/add"])("%s: no uncaught exception, handler not invoked", async (path) => {
        const server = createMockServer();
        vi.mocked(createCommerceAIServer).mockReturnValue(server);
        const sent: Array<{ status: number }> = [];
        const app = express();
        app.use((_req, res, next) => {
          const send = res.send.bind(res);
          res.send = ((body: unknown) => {
            sent.push({ status: res.statusCode });
            return send(body as never);
          }) as typeof res.send;
          next();
        });
        app.use(createExpressRouter({ config: CONFIG, aiRateLimit: false }));
        const httpServer = app.listen(0);
        try {
          await once(httpServer, "listening");
          const { port } = httpServer.address() as AddressInfo;
          const client = http.request({
            port,
            method: "POST",
            path,
            headers: { "Content-Type": "application/json", "Content-Length": "200" },
          });
          client.on("error", () => undefined);
          client.write('{"query":"ha', () => client.destroy());
          await vi.waitFor(() => expect(sent).toHaveLength(1), { timeout: 2000 });
          await ticks();
        } finally {
          httpServer.close();
        }

        expect([400, 499]).toContain(sent[0]?.status);
        expect(uncaught).not.toHaveBeenCalled();
        expect(server.orchestrator.searchByText).not.toHaveBeenCalled();
        expect(server.commercetools.addToCart).not.toHaveBeenCalled();
      });
    });
  });
});
