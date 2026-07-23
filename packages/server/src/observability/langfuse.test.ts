import { afterEach, describe, expect, it, vi } from "vitest";
import {
  flushLangfuse,
  isLangfuseEnabled,
  registerLangfuseFlush,
  withOptionalRequestSpan,
  withRequestSpan,
} from "./langfuse.js";
import { executeSearch, executeSearchSuggestions, executeTts, ValidationError } from "../route-actions.js";
import type { CommerceAIServer } from "../server.js";

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
    } as CommerceAIServer;

    const audio = await executeTts(server, "Hello");
    expect(audio.toString()).toBe("audio");
    expect(server.synthesizeSpeech).toHaveBeenCalledWith("Hello");
  });

  it("executeTts rejects empty text", async () => {
    const server = {
      orchestrator: {} as CommerceAIServer["orchestrator"],
      transcribeAudio: vi.fn(),
      synthesizeSpeech: vi.fn(),
    } as CommerceAIServer;

    await expect(executeTts(server, "  ")).rejects.toBeInstanceOf(ValidationError);
  });
});
