import type {
  CartSnapshot,
  CommerceAIConfig,
  CommercetoolsClient,
  SearchOrchestrator,
} from "@commerce-ai-tool/core";
import { InvalidCredentialsError } from "@commerce-ai-tool/core";
import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createExpressRouter } from "./express.js";
import { MAX_IMAGE_BYTES } from "./input-limits.js";
import { createNextHandlers } from "./next.js";
import { createNextRouteHandler, type NextRouteContext } from "./next-route.js";
import { AI_RATE_LIMIT_MESSAGE } from "./rate-limit.js";
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
      searchByText: vi.fn().mockResolvedValue({ products: [], meta: { total: 0 } }),
      searchByVoice: vi.fn(),
      searchByImage: vi.fn(),
      suggestByText: vi.fn().mockResolvedValue({ suggestions: ["Red Shoes"] }),
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

const CONFIG = {} as CommerceAIConfig;

function ctx(...path: string[]): NextRouteContext {
  return { params: Promise.resolve({ path }) };
}

function jsonRequest(path: string, method: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://localhost/api/commerce-ai${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** `[METHOD, "/path"]` pairs registered on the Express router: the source of truth for the route list. */
function expressRoutes(): Array<[string, string]> {
  vi.mocked(createCommerceAIServer).mockReturnValue(createMockServer());
  const router = createExpressRouter({ config: CONFIG });
  const routes: Array<[string, string]> = [];
  for (const layer of router.stack as unknown as Array<{
    route?: { path: string; methods: Record<string, boolean> };
  }>) {
    if (!layer.route) {
      continue;
    }
    for (const method of Object.keys(layer.route.methods)) {
      routes.push([method.toUpperCase(), layer.route.path]);
    }
  }
  return routes;
}

afterEach(() => {
  vi.mocked(createCommerceAIServer).mockReset();
  vi.restoreAllMocks();
});

describe("createNextRouteHandler", () => {
  it("catch-all dispatches every route Express serves", async () => {
    const routes = expressRoutes();
    expect(routes).toHaveLength(21);

    const server = createMockServer();
    vi.mocked(createCommerceAIServer).mockReturnValue(server);
    const { GET, POST } = createNextRouteHandler(CONFIG, { aiRateLimit: false });

    for (const [method, path] of routes) {
      const segments = path.split("/").filter(Boolean);
      const handle = method === "GET" ? GET : POST;
      const request =
        method === "GET"
          ? jsonRequest(path, "GET", undefined, { "x-commerce-ai-anonymous-id": "anon-1" })
          : jsonRequest(path, "POST", {});

      const response = await handle(request, ctx(...segments));
      const text = await response.clone().text();

      // A routed request reaches its handler (200, or a route-level 4xx such as a validation
      // error); only an unrouted request gets the catch-all's "Not found".
      expect(text, `${method} ${path}`).not.toContain("Not found");
      expect(response.status, `${method} ${path}`).not.toBe(405);
    }
  });

  it("per-route handlers and catch-all return identical responses", async () => {
    const server = createMockServer();
    vi.mocked(server.commercetools.loginAndMerge).mockRejectedValue(new InvalidCredentialsError());
    vi.mocked(createCommerceAIServer).mockReturnValue(server);
    const perRoute = createNextHandlers(CONFIG);
    const catchAll = createNextRouteHandler(CONFIG);

    const cases: Array<{
      name: string;
      perRoute: (req: Request) => Promise<Response>;
      segments: string[];
      method: "GET" | "POST";
      body?: unknown;
      headers?: Record<string, string>;
    }> = [
      { name: "health", perRoute: () => perRoute.health(), segments: ["health"], method: "GET" },
      { name: "facet schema", perRoute: () => perRoute.facetSchema(), segments: ["search", "facet-schema"], method: "GET" },
      { name: "search", perRoute: perRoute.search, segments: ["search"], method: "POST", body: { query: "hat" } },
      { name: "search without query", perRoute: perRoute.search, segments: ["search"], method: "POST", body: {} },
      { name: "suggestions", perRoute: perRoute.searchSuggestions, segments: ["search", "suggestions"], method: "POST", body: { query: "red" } },
      { name: "tts", perRoute: perRoute.tts, segments: ["tts"], method: "POST", body: { text: "hello" } },
      { name: "get cart", perRoute: perRoute.getCart, segments: ["cart"], method: "GET", headers: { "x-commerce-ai-anonymous-id": "anon-1" } },
      { name: "add to cart", perRoute: perRoute.addToCart, segments: ["cart", "add"], method: "POST", body: {} },
      { name: "login with bad credentials", perRoute: perRoute.login, segments: ["cart", "login"], method: "POST", body: { email: "a@example.test", password: "x" } },
      { name: "logout", perRoute: perRoute.logout, segments: ["cart", "logout"], method: "POST" },
    ];

    for (const testCase of cases) {
      const expected = await testCase.perRoute(
        jsonRequest(`/${testCase.segments.join("/")}`, testCase.method, testCase.body, testCase.headers),
      );
      const actual = await (testCase.method === "GET" ? catchAll.GET : catchAll.POST)(
        jsonRequest(`/${testCase.segments.join("/")}`, testCase.method, testCase.body, testCase.headers),
        ctx(...testCase.segments),
      );

      expect(actual.status, testCase.name).toBe(expected.status);
      expect(await actual.text(), testCase.name).toBe(await expected.text());
      expect(actual.headers.get("content-type"), testCase.name).toBe(
        expected.headers.get("content-type"),
      );
    }
  });

  it("two routes served by one handler instance share the AI rate-limit bucket", async () => {
    vi.mocked(createCommerceAIServer).mockReturnValue(createMockServer());
    const { POST } = createNextRouteHandler(CONFIG, { aiRateLimit: { limit: 1 } });

    const first = await POST(jsonRequest("/tts", "POST", { text: "hello" }), ctx("tts"));
    const second = await POST(jsonRequest("/search", "POST", { query: "hat" }), ctx("search"));

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    await expect(second.json()).resolves.toEqual({ error: AI_RATE_LIMIT_MESSAGE, code: "RATE_LIMITED" });
    expect(second.headers.get("retry-after")).toBe("60");
  });

  it("separate handler instances keep separate buckets", async () => {
    vi.mocked(createCommerceAIServer).mockReturnValue(createMockServer());
    const a = createNextRouteHandler(CONFIG, { aiRateLimit: { limit: 1 } });
    const b = createNextRouteHandler(CONFIG, { aiRateLimit: { limit: 1 } });

    expect((await a.POST(jsonRequest("/tts", "POST", { text: "x" }), ctx("tts"))).status).toBe(200);
    expect((await b.POST(jsonRequest("/tts", "POST", { text: "x" }), ctx("tts"))).status).toBe(200);
  });

  it("returns 404 with the standard error body for an unknown path", async () => {
    const server = createMockServer();
    vi.mocked(createCommerceAIServer).mockReturnValue(server);
    const { GET, POST } = createNextRouteHandler(CONFIG);

    for (const response of [
      await GET(jsonRequest("/nope", "GET"), ctx("nope")),
      await POST(jsonRequest("/search/nope", "POST", {}), ctx("search", "nope")),
      await GET(jsonRequest("", "GET"), ctx()),
      await GET(jsonRequest("/health", "GET"), { params: Promise.resolve({}) } as unknown as NextRouteContext),
    ]) {
      expect(response.status).toBe(404);
      expect(response.headers.get("content-type")).toContain("application/json");
      const body = (await response.json()) as { error: unknown; code: unknown };
      expect(typeof body.error).toBe("string");
      expect(body.code).toBe("NOT_FOUND");
    }
  });

  it("treats a known path with the wrong method as unmatched (404), like the Express router", async () => {
    vi.mocked(createCommerceAIServer).mockReturnValue(createMockServer());
    const { GET, POST } = createNextRouteHandler(CONFIG);

    expect((await GET(jsonRequest("/search", "GET"), ctx("search"))).status).toBe(404);
    expect((await POST(jsonRequest("/health", "POST", {}), ctx("health"))).status).toBe(404);
  });

  it("does not let traversal segments or encoded slashes reach another route", async () => {
    const server = createMockServer();
    vi.mocked(createCommerceAIServer).mockReturnValue(server);
    const { GET, POST } = createNextRouteHandler(CONFIG, { aiRateLimit: false });

    const attempts: string[][] = [
      ["search", "..", "cart"],
      ["..", "cart"],
      [".", "cart"],
      ["cart", ".", "add"],
      ["cart/add"],
      ["cart\\add"],
      ["search/suggestions"],
      ["", "search"],
      ["search", ""],
      ["cart", "", "add"],
      ["cart%2Fadd"],
      ["Cart", "Add"],
    ];

    for (const segments of attempts) {
      const post = await POST(jsonRequest("/anything", "POST", { query: "hat" }), ctx(...segments));
      const get = await GET(jsonRequest("/anything", "GET"), ctx(...segments));
      expect(post.status, JSON.stringify(segments)).toBe(404);
      expect(get.status, JSON.stringify(segments)).toBe(404);
    }
    expect(server.orchestrator.searchByText).not.toHaveBeenCalled();
    expect(server.commercetools.addToCart).not.toHaveBeenCalled();
    expect(server.commercetools.getCart).not.toHaveBeenCalled();
  });

  it("applies the 415 content-type check on JSON routes", async () => {
    const server = createMockServer();
    vi.mocked(createCommerceAIServer).mockReturnValue(server);
    const { POST } = createNextRouteHandler(CONFIG);

    const response = await POST(
      new Request("http://localhost/api/commerce-ai/search", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ query: "hat" }),
      }),
      ctx("search"),
    );

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toMatchObject({ code: "UNSUPPORTED_MEDIA_TYPE" });
    expect(server.orchestrator.searchByText).not.toHaveBeenCalled();
  });

  it("enforces upload size limits on multipart routes", async () => {
    const server = createMockServer();
    vi.mocked(createCommerceAIServer).mockReturnValue(server);
    const { POST } = createNextRouteHandler(CONFIG);
    const form = new FormData();
    form.append(
      "image",
      new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], "upload.bin", { type: "image/jpeg" }),
    );

    const response = await POST(
      new Request("http://localhost/api/commerce-ai/search/image", { method: "POST", body: form }),
      ctx("search", "image"),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
    expect(server.orchestrator.searchByImage).not.toHaveBeenCalled();
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
    const { POST } = createNextRouteHandler(CONFIG);

    const pending = POST(
      new Request("http://localhost/api/commerce-ai/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "hat" }),
        signal: client.signal,
      }),
      ctx("search"),
    );
    await vi.waitFor(() => expect(seenSignal).toBeDefined());
    client.abort();

    const response = await pending;
    expect(seenSignal?.aborted).toBe(true);
    expect(response.status).toBe(499);
  });

  it("serves HEAD requests from the matching GET route", async () => {
    vi.mocked(createCommerceAIServer).mockReturnValue(createMockServer());
    const { GET } = createNextRouteHandler(CONFIG);

    const response = await GET(
      new Request("http://localhost/api/commerce-ai/health", { method: "HEAD" }),
      ctx("health"),
    );

    expect(response.status).toBe(200);
  });

  it("answers 500 with a masked body when the config cannot be built, and retries on the next request", async () => {
    vi.mocked(createCommerceAIServer).mockReturnValue(createMockServer());
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    let attempts = 0;
    const { POST } = createNextRouteHandler(() => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("CTP_CLIENT_SECRET is missing");
      }
      return CONFIG;
    });

    const failed = await POST(jsonRequest("/search", "POST", { query: "hat" }), ctx("search"));
    const retried = await POST(jsonRequest("/search", "POST", { query: "hat" }), ctx("search"));

    expect(failed.status).toBe(500);
    const body = (await failed.json()) as { error: string; code: string };
    expect(body.code).toBe("INTERNAL");
    expect(JSON.stringify(body)).not.toContain("CTP_CLIENT_SECRET");
    // The cause is logged server-side through the shared error mapping, never returned.
    expect(errorSpy).toHaveBeenCalled();
    expect(retried.status).toBe(200);
    expect(attempts).toBe(2);
  });

  describe("a request body that errors mid-upload", () => {
    function interruptedUpload(signal?: AbortSignal): Request {
      const encoder = new TextEncoder();
      let pulled = false;
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (!pulled) {
            pulled = true;
            controller.enqueue(
              encoder.encode(
                '--b\r\ncontent-disposition: form-data; name="image"; filename="a.jpg"\r\n' +
                  "content-type: image/jpeg\r\n\r\n" +
                  "x".repeat(1000),
              ),
            );
            return;
          }
          controller.error(new Error("client went away"));
        },
      });
      return new Request("http://localhost/api/commerce-ai/search/image", {
        method: "POST",
        headers: { "Content-Type": "multipart/form-data; boundary=b" },
        body,
        duplex: "half",
        signal,
      } as RequestInit);
    }

    async function settle(promise: Promise<Response>): Promise<Response> {
      return Promise.race([
        promise,
        new Promise<never>((_resolve, reject) => {
          setTimeout(() => reject(new Error("request never settled")), 2000);
        }),
      ]);
    }

    it("answers 499 when the client aborted, without an uncaught exception", async () => {
      const server = createMockServer();
      vi.mocked(createCommerceAIServer).mockReturnValue(server);
      const uncaught = vi.fn();
      process.on("uncaughtException", uncaught);
      const { POST } = createNextRouteHandler(CONFIG);
      const client = new AbortController();
      const pending = POST(interruptedUpload(client.signal), ctx("search", "image"));
      client.abort();

      try {
        const response = await settle(pending);
        expect(response.status).toBe(499);
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(uncaught).not.toHaveBeenCalled();
        expect(server.orchestrator.searchByImage).not.toHaveBeenCalled();
      } finally {
        process.off("uncaughtException", uncaught);
      }
    });

    it("answers 400 when the stream fails without an abort signal", async () => {
      const server = createMockServer();
      vi.mocked(createCommerceAIServer).mockReturnValue(server);
      const uncaught = vi.fn();
      process.on("uncaughtException", uncaught);
      const { POST } = createNextRouteHandler(CONFIG);

      try {
        const response = await settle(POST(interruptedUpload(), ctx("search", "image")));
        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toMatchObject({ code: "VALIDATION" });
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(uncaught).not.toHaveBeenCalled();
        expect(server.orchestrator.searchByImage).not.toHaveBeenCalled();
      } finally {
        process.off("uncaughtException", uncaught);
      }
    });
  });

  it("creates the server lazily when config is a function, once", async () => {
    vi.mocked(createCommerceAIServer).mockReturnValue(createMockServer());
    const config = vi.fn(() => CONFIG);
    const { POST } = createNextRouteHandler(config);

    expect(config).not.toHaveBeenCalled();
    await POST(jsonRequest("/search", "POST", { query: "hat" }), ctx("search"));
    await POST(jsonRequest("/search", "POST", { query: "hat" }), ctx("search"));

    expect(config).toHaveBeenCalledTimes(1);
    expect(createCommerceAIServer).toHaveBeenCalledTimes(1);
  });
});

describe("Express router", () => {
  it("leaves a known path with the wrong method unmatched (404), the behaviour the catch-all matches", async () => {
    vi.mocked(createCommerceAIServer).mockReturnValue(createMockServer());
    const app = express();
    app.use(createExpressRouter({ config: CONFIG }));
    const { default: request } = await import("supertest");

    await request(app).get("/search").expect(404);
    await request(app).post("/health").expect(404);
  });
});
