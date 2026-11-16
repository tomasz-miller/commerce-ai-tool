import { withPipelineSpan, withTraceSession } from "@commerce-ai-tool/core/internal";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  flushLangfuse,
  isLangfuseEnabled,
  registerLangfuseFlush,
  scheduleFlush,
  withOptionalRequestSpan,
  withRequestSpan,
} from "./langfuse.js";
import { resetLangfuseFlushWarningForTests } from "./flush.js";
import { executeSearch, executeSearchSuggestions, executeTts } from "../route-actions.js";
import { ValidationError } from "../errors.js";
import type { CommerceAIServer } from "../server.js";

vi.mock("@commerce-ai-tool/core/internal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@commerce-ai-tool/core/internal")>();
  return {
    ...actual,
    withPipelineSpan: vi.fn(actual.withPipelineSpan),
    withTraceSession: vi.fn(actual.withTraceSession),
  };
});

function enableLangfuse(flush: () => Promise<void>): void {
  process.env.LANGFUSE_PUBLIC_KEY = "pk";
  process.env.LANGFUSE_SECRET_KEY = "sk";
  registerLangfuseFlush(flush);
}

/** Lets the detached `void flushLangfuse()` settle, including its catch handler. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

describe("langfuse server helpers", () => {
  afterEach(() => {
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_TRACE_SUGGESTIONS;
    registerLangfuseFlush(null);
  });

  it("flushLangfuse is a no-op without keys", async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    registerLangfuseFlush(flush);
    await flushLangfuse();
    expect(flush).not.toHaveBeenCalled();
  });

  it("flushLangfuse calls the registered flush when enabled", async () => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk";
    process.env.LANGFUSE_SECRET_KEY = "sk";
    const flush = vi.fn().mockResolvedValue(undefined);
    registerLangfuseFlush(flush);
    await flushLangfuse();
    expect(flush).toHaveBeenCalledOnce();
  });

  it("withRequestSpan passes through when Langfuse is disabled", async () => {
    const result = await withRequestSpan("commerce-ai.search", { input: { q: "x" } }, async () => ({
      ok: true,
    }));
    expect(result).toEqual({ ok: true });
  });

  it("withOptionalRequestSpan skips tracing when disabled", async () => {
    const result = await withOptionalRequestSpan(
      false,
      "commerce-ai.search.suggestions",
      { input: { query: "gl" } },
      async () => ({ suggestions: ["glass"] }),
    );
    expect(result).toEqual({ suggestions: ["glass"] });
  });

  it("isLangfuseEnabled requires both keys", () => {
    expect(isLangfuseEnabled()).toBe(false);
    process.env.LANGFUSE_PUBLIC_KEY = "pk";
    process.env.LANGFUSE_SECRET_KEY = "sk";
    expect(isLangfuseEnabled()).toBe(true);
  });
});

describe("route actions with tracing no-op", () => {
  afterEach(() => {
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_TRACE_SUGGESTIONS;
    registerLangfuseFlush(null);
  });

  it("executeSearch still returns orchestrator results", async () => {
    const server = {
      orchestrator: {
        searchByText: vi.fn().mockResolvedValue({
          products: [{ id: "1", name: "Shoe" }],
          meta: { total: 1 },
        }),
      },
      cartDefaults: { currency: "EUR", catalogLocale: "en" },
      transcribeAudio: vi.fn(),
      synthesizeSpeech: vi.fn(),
    } as unknown as CommerceAIServer;

    const result = await executeSearch(server, { query: "shoes" });
    expect(result).toEqual({
      products: [{ id: "1", name: "Shoe" }],
      meta: { total: 1 },
    });
  });

  it("executeSearchSuggestions flushes Langfuse when AI fallback ran without a request span", async () => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk";
    process.env.LANGFUSE_SECRET_KEY = "sk";
    const flush = vi.fn().mockResolvedValue(undefined);
    registerLangfuseFlush(flush);

    const server = {
      orchestrator: {
        suggestByText: vi.fn().mockResolvedValue({
          suggestions: ["wooden table"],
          aiFallbackUsed: true,
        }),
      },
      cartDefaults: { currency: "EUR", catalogLocale: "en" },
      transcribeAudio: vi.fn(),
      synthesizeSpeech: vi.fn(),
    } as unknown as CommerceAIServer;

    const result = await executeSearchSuggestions(server, { query: "szukam stolu" });
    expect(result).toEqual({
      suggestions: ["wooden table"],
      aiFallbackUsed: true,
    });
    expect(flush).toHaveBeenCalledOnce();
  });

  it("executeSearchSuggestions does not flush for CT-only suggestions", async () => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk";
    process.env.LANGFUSE_SECRET_KEY = "sk";
    const flush = vi.fn().mockResolvedValue(undefined);
    registerLangfuseFlush(flush);

    const server = {
      orchestrator: {
        suggestByText: vi.fn().mockResolvedValue({
          suggestions: ["glass"],
        }),
      },
      cartDefaults: { currency: "EUR", catalogLocale: "en" },
      transcribeAudio: vi.fn(),
      synthesizeSpeech: vi.fn(),
    } as unknown as CommerceAIServer;

    await executeSearchSuggestions(server, { query: "gl" });
    expect(flush).not.toHaveBeenCalled();
  });

  it("executeTts still synthesizes speech", async () => {
    const server = {
      orchestrator: {} as CommerceAIServer["orchestrator"],
      transcribeAudio: vi.fn(),
      synthesizeSpeech: vi.fn().mockResolvedValue(Buffer.from("audio")),
    } as unknown as CommerceAIServer;

    const audio = await executeTts(server, "Hello");
    expect(audio.toString()).toBe("audio");
    expect(server.synthesizeSpeech).toHaveBeenCalledWith("Hello", undefined);
  });

  it("executeTts rejects empty text", async () => {
    const server = {
      orchestrator: {} as CommerceAIServer["orchestrator"],
      transcribeAudio: vi.fn(),
      synthesizeSpeech: vi.fn(),
    } as unknown as CommerceAIServer;

    await expect(executeTts(server, "  ")).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("fail-open, non-blocking flush", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetLangfuseFlushWarningForTests();
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_TRACE_SUGGESTIONS;
    registerLangfuseFlush(null);
  });

  function searchServer(): CommerceAIServer {
    return {
      orchestrator: {
        searchByText: vi.fn().mockResolvedValue({ products: [], meta: { total: 0 } }),
        suggestByText: vi.fn().mockResolvedValue({ suggestions: ["wooden table"], aiFallbackUsed: true }),
      },
      cartDefaults: { currency: "EUR", catalogLocale: "en" },
      transcribeAudio: vi.fn(),
      synthesizeSpeech: vi.fn().mockResolvedValue(Buffer.from("audio")),
    } as unknown as CommerceAIServer;
  }

  it("flushLangfuse never rejects and warns with the error name only", async () => {
    enableLangfuse(vi.fn().mockRejectedValue(new TypeError("secret payload pk-lf-123")));

    await expect(flushLangfuse()).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledOnce();
    const logged = warn.mock.calls.flat().join(" ");
    expect(logged).toContain("TypeError");
    expect(logged).not.toContain("secret payload");
    expect(logged).not.toContain("pk-lf-123");
  });

  it("flushLangfuse names a non-Error rejection generically", async () => {
    enableLangfuse(vi.fn().mockRejectedValue("secret string"));

    await expect(flushLangfuse()).resolves.toBeUndefined();

    const logged = warn.mock.calls.flat().join(" ");
    expect(logged).toContain("NonError");
    expect(logged).not.toContain("secret string");
  });

  it("rate-limits the flush warning to one per 60 seconds", async () => {
    enableLangfuse(vi.fn().mockRejectedValue(new Error("x")));
    const now = vi.spyOn(Date, "now");

    now.mockReturnValue(1_000_000);
    await flushLangfuse();
    now.mockReturnValue(1_000_000 + 59_000);
    await flushLangfuse();
    expect(warn).toHaveBeenCalledOnce();

    now.mockReturnValue(1_000_000 + 60_000);
    await flushLangfuse();
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("flushLangfuse also survives a registered flush that throws synchronously", async () => {
    enableLangfuse(() => {
      throw new Error("sync");
    });
    await expect(flushLangfuse()).resolves.toBeUndefined();
  });

  it("executeSearch resolves when the registered flush rejects", async () => {
    enableLangfuse(vi.fn().mockRejectedValue(new Error("BatchSpanProcessor: span export failed")));

    await expect(executeSearch(searchServer(), { query: "shoes" })).resolves.toEqual({
      products: [],
      meta: { total: 0 },
    });
    await settle();
  });

  it("executeTts resolves when the registered flush rejects", async () => {
    enableLangfuse(vi.fn().mockRejectedValue(new Error("Timeout")));

    const audio = await executeTts(searchServer(), "Hello");
    expect(audio.toString()).toBe("audio");
    await settle();
  });

  it("executeSearchSuggestions AI fallback resolves when the registered flush rejects", async () => {
    enableLangfuse(vi.fn().mockRejectedValue(new Error("Timeout")));

    await expect(executeSearchSuggestions(searchServer(), { query: "szukam stolu" })).resolves.toEqual({
      suggestions: ["wooden table"],
      aiFallbackUsed: true,
    });
    await settle();
  });

  it("does not wait for a slow flush before returning", async () => {
    enableLangfuse(() => new Promise<void>(() => undefined));

    await expect(executeSearch(searchServer(), { query: "shoes" })).resolves.toBeDefined();
  });

  it("flush runs after the root span has ended", async () => {
    const events: string[] = [];
    vi.mocked(withPipelineSpan).mockImplementationOnce(async (_name, _attributes, fn) => {
      try {
        return await fn(null);
      } finally {
        events.push("span-end");
      }
    });
    enableLangfuse(async () => {
      events.push("flush");
    });

    await withRequestSpan("commerce-ai.search", {}, async () => {
      events.push("fn");
      return { ok: true };
    });
    await settle();

    expect(events).toEqual(["fn", "span-end", "flush"]);
  });

  it("flushes after the span ended even when the handler throws", async () => {
    const events: string[] = [];
    vi.mocked(withPipelineSpan).mockImplementationOnce(async (_name, _attributes, fn) => {
      try {
        return await fn(null);
      } finally {
        events.push("span-end");
      }
    });
    enableLangfuse(async () => {
      events.push("flush");
    });

    await expect(
      withRequestSpan("commerce-ai.search", {}, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    await settle();

    expect(events).toEqual(["span-end", "flush"]);
  });

  it("scheduleFlush hands the flush to defer instead of running it inline", async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    enableLangfuse(flush);
    const defer = vi.fn();

    scheduleFlush(defer);

    expect(defer).toHaveBeenCalledOnce();
    expect(flush).not.toHaveBeenCalled();
    await defer.mock.calls[0]![0]();
    expect(flush).toHaveBeenCalledOnce();
  });

  it("scheduleFlush falls back to an inline flush when defer throws", async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    enableLangfuse(flush);

    scheduleFlush(() => {
      throw new Error("`after` was called outside a request scope");
    });
    await settle();

    expect(flush).toHaveBeenCalledOnce();
  });

  it("scheduleFlush without defer runs flushLangfuse without waiting", async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    enableLangfuse(flush);

    scheduleFlush();
    await settle();

    expect(flush).toHaveBeenCalledOnce();
  });

  it("executeSearch passes defer through to the flush", async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    enableLangfuse(flush);
    const defer = vi.fn();

    await executeSearch(searchServer(), { query: "shoes" }, defer);
    await settle();

    expect(defer).toHaveBeenCalledOnce();
    expect(flush).not.toHaveBeenCalled();
  });

  it("executeSearchSuggestions AI fallback uses defer when the span is skipped", async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    enableLangfuse(flush);
    const defer = vi.fn();

    await executeSearchSuggestions(searchServer(), { query: "szukam stolu" }, defer);
    await settle();

    expect(defer).toHaveBeenCalledOnce();
    expect(flush).not.toHaveBeenCalled();
  });

  it("keeps the registered flush key stable for hosts that register it without importing the server", async () => {
    const { LANGFUSE_FLUSH_GLOBAL_KEY } = await import("./flush.js");
    expect(LANGFUSE_FLUSH_GLOBAL_KEY).toBe("__commerceAiToolLangfuseFlush__");
  });
});

describe("search request tracing attributes", () => {
  function createSearchServer(): CommerceAIServer {
    return {
      orchestrator: {
        searchByText: vi.fn().mockResolvedValue({ products: [], meta: { total: 0 } }),
      },
      cartDefaults: { currency: "EUR", catalogLocale: "en" },
      transcribeAudio: vi.fn(),
      synthesizeSpeech: vi.fn(),
    } as unknown as CommerceAIServer;
  }

  afterEach(() => {
    vi.mocked(withPipelineSpan).mockClear();
    vi.mocked(withTraceSession).mockClear();
  });

  it("request span input omits the raw query when the generation already carries it", async () => {
    await executeSearch(createSearchServer(), {
      query: "red shoes for shopper@example.test",
      refineQuery: "in blue",
      searchTerms: ["shoes"],
    });

    const [name, attributes] = vi.mocked(withPipelineSpan).mock.calls[0] ?? [];
    expect(name).toBe("commerce-ai.search");
    expect(attributes?.input).toEqual({
      queryLength: "red shoes for shopper@example.test".length,
      refineQueryLength: "in blue".length,
    });
    expect(JSON.stringify(attributes)).not.toContain("shopper@example.test");
    expect(JSON.stringify(attributes)).not.toContain("in blue");
  });

  it("sessionId propagates from widgetSessionId", async () => {
    await executeSearch(createSearchServer(), {
      query: "shoes",
      widgetSessionId: "widget-1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed",
    });

    expect(withTraceSession).toHaveBeenCalledWith(
      "widget-1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed",
      expect.any(Function),
    );
  });

  it("drops an invalid widgetSessionId instead of failing the request", async () => {
    const server = createSearchServer();
    for (const widgetSessionId of ["x".repeat(201), "", "has space", 42, { id: "x" }, "a\nb"]) {
      vi.mocked(withTraceSession).mockClear();
      await expect(
        executeSearch(server, { query: "shoes", widgetSessionId } as never),
      ).resolves.toBeDefined();
      expect(withTraceSession).toHaveBeenCalledWith(undefined, expect.any(Function));
    }
  });

  it("accepts a widgetSessionId of exactly 200 characters", async () => {
    const id = "a".repeat(200);
    await executeSearch(createSearchServer(), { query: "shoes", widgetSessionId: id });
    expect(withTraceSession).toHaveBeenCalledWith(id, expect.any(Function));
  });

  it("wraps the request span in the session so the root span carries the session id", async () => {
    const events: string[] = [];
    vi.mocked(withTraceSession).mockImplementationOnce(async (_id, fn) => {
      events.push("session-start");
      return fn();
    });
    vi.mocked(withPipelineSpan).mockImplementationOnce(async (_name, _attributes, fn) => {
      events.push("span-start");
      return fn(null);
    });

    await executeSearch(createSearchServer(), { query: "shoes", widgetSessionId: "abc" });

    expect(events).toEqual(["session-start", "span-start"]);
  });
});
