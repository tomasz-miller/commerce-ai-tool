import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { propagateAttributes, startActiveObservation } from "@langfuse/tracing";
import {
  isLangfuseEnabled,
  isLangfusePromptsEnabled,
  shouldExposeTraceId,
  shouldTraceSuggestions,
} from "./enabled.js";
import { redactBase64ImageInput, redactBinaryInput } from "./redact.js";
import { withTraceSession } from "./spans.js";
import { wrapAIProvider } from "./wrap-ai-provider.js";
import type { AICallMetrics, AICallOptions, AIProvider } from "../ai/types.js";

vi.mock("@langfuse/tracing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@langfuse/tracing")>();
  return {
    ...actual,
    startActiveObservation: vi.fn(actual.startActiveObservation),
    propagateAttributes: vi.fn(actual.propagateAttributes),
  };
});

describe("isLangfuseEnabled", () => {
  const clearLangfuseEnv = () => {
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.CAT_DEBUG;
  };

  beforeEach(clearLangfuseEnv);
  afterEach(clearLangfuseEnv);

  it("returns false when keys are missing", () => {
    expect(isLangfuseEnabled()).toBe(false);
  });

  it("returns true only when both keys are set", () => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk";
    expect(isLangfuseEnabled()).toBe(false);
    process.env.LANGFUSE_SECRET_KEY = "sk";
    expect(isLangfuseEnabled()).toBe(true);
  });
});

describe("isLangfusePromptsEnabled", () => {
  const clearEnv = () => {
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_PROMPTS;
  };

  beforeEach(clearEnv);
  afterEach(clearEnv);

  it("requires keys and LANGFUSE_PROMPTS=true", () => {
    expect(isLangfusePromptsEnabled()).toBe(false);
    process.env.LANGFUSE_PUBLIC_KEY = "pk";
    process.env.LANGFUSE_SECRET_KEY = "sk";
    expect(isLangfusePromptsEnabled()).toBe(false);
    process.env.LANGFUSE_PROMPTS = "true";
    expect(isLangfusePromptsEnabled()).toBe(true);
  });
});

describe("shouldExposeTraceId", () => {
  const clearLangfuseEnv = () => {
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.CAT_DEBUG;
  };

  beforeEach(clearLangfuseEnv);
  afterEach(clearLangfuseEnv);

  it("is true when CAT_DEBUG is set even without Langfuse", () => {
    process.env.CAT_DEBUG = "true";
    expect(shouldExposeTraceId()).toBe(true);
  });
});

describe("shouldTraceSuggestions", () => {
  const clearEnv = () => {
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_TRACE_SUGGESTIONS;
  };

  beforeEach(clearEnv);
  afterEach(clearEnv);

  it("is off by default even when Langfuse is enabled", () => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk";
    process.env.LANGFUSE_SECRET_KEY = "sk";
    expect(shouldTraceSuggestions()).toBe(false);
  });

  it("is on only when explicitly opted in", () => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk";
    process.env.LANGFUSE_SECRET_KEY = "sk";
    process.env.LANGFUSE_TRACE_SUGGESTIONS = "true";
    expect(shouldTraceSuggestions()).toBe(true);
  });
});

describe("redactBinaryInput", () => {
  it("returns mime, length, and hash without raw bytes", () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const redacted = redactBinaryInput("audio/wav", bytes);
    expect(redacted).toEqual({
      mimeType: "audio/wav",
      byteLength: 4,
      hash: expect.any(String),
    });
    expect(redacted.hash).toHaveLength(64);
  });

  it("redacts base64 image payloads", () => {
    const redacted = redactBase64ImageInput("image/jpeg", "data:image/jpeg;base64,abcd");
    expect(redacted.mimeType).toBe("image/jpeg");
    expect(redacted.byteLength).toBeGreaterThan(0);
    expect(redacted.hash).toHaveLength(64);
  });

  it("image hash covers the full payload", () => {
    const prefix = "A".repeat(64);
    const first = redactBase64ImageInput("image/jpeg", `${prefix}AAAA`);
    const second = redactBase64ImageInput("image/jpeg", `${prefix}BBBB`);
    expect(first.hash).not.toBe(second.hash);
  });

  it("image hash matches the hash of the decoded bytes, so both spans correlate", () => {
    const bytes = new Uint8Array(1000).map((_, index) => (index * 7) % 256);
    const base64 = Buffer.from(bytes).toString("base64");

    const fromBase64 = redactBase64ImageInput("image/png", `data:image/png;base64,${base64}`);
    const fromBytes = redactBinaryInput("image/png", bytes);

    expect(fromBase64.hash).toBe(fromBytes.hash);
    expect(fromBase64.byteLength).toBe(bytes.byteLength);
  });
});

describe("withTraceSession", () => {
  afterEach(() => {
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    vi.mocked(propagateAttributes).mockClear();
  });

  it("calls through without propagating when Langfuse is disabled", async () => {
    await expect(withTraceSession("sess-1", async () => "ok")).resolves.toBe("ok");
    expect(propagateAttributes).not.toHaveBeenCalled();
  });

  it("propagates the session id when Langfuse is enabled", async () => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk";
    process.env.LANGFUSE_SECRET_KEY = "sk";

    await expect(withTraceSession("sess-1", async () => "ok")).resolves.toBe("ok");

    expect(propagateAttributes).toHaveBeenCalledWith({ sessionId: "sess-1" }, expect.any(Function));
  });

  it("does not propagate when there is no session id", async () => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk";
    process.env.LANGFUSE_SECRET_KEY = "sk";

    await expect(withTraceSession(undefined, async () => "ok")).resolves.toBe("ok");
    expect(propagateAttributes).not.toHaveBeenCalled();
  });
});

describe("wrapAIProvider", () => {
  afterEach(() => {
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
  });

  function createMockProvider(): AIProvider {
    return {
      interpretTextQuery: vi.fn(async () => ({
        searchTerms: ["shoes"],
        interpretation: "shoes",
      })),
      interpretRefineQuery: vi.fn(async () => ({
        searchTerms: ["shoes"],
        interpretation: "refine",
      })),
      interpretImageQuery: vi.fn(async () => ({
        searchTerms: ["shirt"],
        interpretation: "shirt",
      })),
      interpretVoiceAudio: vi.fn(async () => ({
        transcript: "hello",
        enhancedQuery: "hello",
        searchTerms: ["hello"],
        interpretation: "hello",
      })),
      enhanceVoiceTranscript: vi.fn(async (t) => t),
      suggestSearchTerms: vi.fn(async () => ["wooden table"]),
      summarizeVoiceResults: vi.fn(async () => "Found 1 product"),
      decomposeShoppingMission: vi.fn(async () => ({
        isMission: false,
        confidence: 0,
        intents: [],
        interpretation: "single product",
      })),
    };
  }

  it("exposes interpretVoiceTranscript only when the wrapped provider implements it", async () => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk";
    process.env.LANGFUSE_SECRET_KEY = "sk";
    const locales = { queryLocale: "en", catalogLocale: "en" };

    const legacy = wrapAIProvider(createMockProvider(), { provider: "openrouter", textModel: "m" });
    expect(legacy.interpretVoiceTranscript).toBeUndefined();

    const interpretVoiceTranscript = vi.fn(async () => ({
      enhancedQuery: "red shoes",
      searchTerms: ["red shoes"],
      interpretation: "red shoes",
    }));
    const wrapped = wrapAIProvider(
      { ...createMockProvider(), interpretVoiceTranscript },
      { provider: "openrouter", textModel: "m" },
    );
    const result = await wrapped.interpretVoiceTranscript!("um red shoes", locales);

    expect(result.enhancedQuery).toBe("red shoes");
    expect(interpretVoiceTranscript).toHaveBeenCalledWith(
      "um red shoes",
      locales,
      [],
      expect.objectContaining({ onMetrics: expect.any(Function) as unknown }),
    );
  });

  it("returns the same provider instance methods when Langfuse is disabled", async () => {
    const provider = createMockProvider();
    const wrapped = wrapAIProvider(provider, { provider: "openrouter", textModel: "test" });
    expect(wrapped).toBe(provider);

    await wrapped.interpretTextQuery("shoes", { queryLocale: "en", catalogLocale: "en" });
    expect(provider.interpretTextQuery).toHaveBeenCalledOnce();
  });

  it("delegates to the underlying provider when Langfuse is enabled", async () => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk";
    process.env.LANGFUSE_SECRET_KEY = "sk";

    const provider = createMockProvider();
    const wrapped = wrapAIProvider(provider, {
      provider: "openrouter",
      textModel: "google/gemini-flash",
    });
    expect(wrapped).not.toBe(provider);

    const result = await wrapped.interpretTextQuery("shoes", {
      queryLocale: "en",
      catalogLocale: "en",
    });
    expect(result.searchTerms).toEqual(["shoes"]);
    expect(provider.interpretTextQuery).toHaveBeenCalledOnce();

    await wrapped.interpretImageQuery("abc", "image/png", {
      queryLocale: "en",
      catalogLocale: "en",
    });
    expect(provider.interpretImageQuery).toHaveBeenCalledWith(
      "abc",
      "image/png",
      expect.anything(),
      [],
      expect.objectContaining({ onMetrics: expect.any(Function) }),
    );
  });
});

describe("wrapAIProvider generation metrics", () => {
  const locales = { queryLocale: "en", catalogLocale: "en" };
  const realStart = vi.mocked(startActiveObservation).getMockImplementation();

  type Recorded = Record<string, unknown>;
  let generations: Recorded[];

  beforeEach(() => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk";
    process.env.LANGFUSE_SECRET_KEY = "sk";
    generations = [];
    vi.mocked(startActiveObservation).mockImplementation(((
      _name: string,
      fn: (generation: { update: (attrs: Recorded) => void }) => unknown,
    ) => {
      const recorded: Recorded = {};
      generations.push(recorded);
      return fn({ update: (attrs) => Object.assign(recorded, attrs) });
    }) as never);
  });

  afterEach(() => {
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    vi.mocked(startActiveObservation).mockImplementation(realStart as never);
  });

  function providerReporting(metricsFor: (text: string) => AICallMetrics, delayMs = 0): AIProvider {
    return {
      interpretTextQuery: vi.fn(async (text: string, _l: unknown, _c: unknown, options?: AICallOptions) => {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        options?.onMetrics?.(metricsFor(text));
        return { searchTerms: [text], interpretation: text };
      }),
    } as unknown as AIProvider;
  }

  it("generation gets model from the provider response, not config", async () => {
    const provider = providerReporting(() => ({ model: "actual/fallback-model" }));
    const wrapped = wrapAIProvider(provider, { provider: "openrouter", textModel: "configured/model" });

    await wrapped.interpretTextQuery("shoes", locales);

    expect(generations[0]?.model).toBe("actual/fallback-model");
  });

  it("usageDetails input/output/total are set", async () => {
    const provider = providerReporting(() => ({
      model: "m",
      usage: { input: 11, output: 7, total: 18, cacheRead: 5 },
      costUsd: 0.0021,
    }));
    const wrapped = wrapAIProvider(provider, { provider: "openrouter", textModel: "m" });

    await wrapped.interpretTextQuery("shoes", locales);

    expect(generations[0]?.usageDetails).toEqual({
      input: 11,
      output: 7,
      total: 18,
      cache_read_input_tokens: 5,
    });
    expect(generations[0]?.costDetails).toEqual({ total: 0.0021 });
  });

  it("omits cache_read_input_tokens and costDetails when the provider reports neither", async () => {
    const provider = providerReporting(() => ({
      model: "m",
      usage: { input: 1, output: 2, total: 3 },
    }));
    const wrapped = wrapAIProvider(provider, { provider: "bedrock", textModel: "m" });

    await wrapped.interpretTextQuery("shoes", locales);

    expect(generations[0]?.usageDetails).toEqual({ input: 1, output: 2, total: 3 });
    expect(generations[0]?.costDetails).toBeUndefined();
  });

  it("two concurrent calls do not swap metrics", async () => {
    const metricsByText: Record<string, AICallMetrics> = {
      slow: { model: "model-slow", usage: { input: 100, output: 10, total: 110 }, costUsd: 0.1 },
      fast: { model: "model-fast", usage: { input: 1, output: 2, total: 3 }, costUsd: 0.001 },
    };
    const provider: AIProvider = {
      interpretTextQuery: vi.fn(
        async (text: string, _l: unknown, _c: unknown, options?: AICallOptions) => {
          await new Promise((resolve) => setTimeout(resolve, text === "slow" ? 20 : 1));
          options?.onMetrics?.(metricsByText[text]!);
          return { searchTerms: [text], interpretation: text };
        },
      ),
    } as unknown as AIProvider;
    const wrapped = wrapAIProvider(provider, { provider: "openrouter", textModel: "configured" });

    await Promise.all([
      wrapped.interpretTextQuery("slow", locales),
      wrapped.interpretTextQuery("fast", locales),
    ]);

    const byInput = (text: string) =>
      generations.find((g) => (g.input as { text: string }).text === text);
    expect(byInput("slow")).toMatchObject({
      model: "model-slow",
      usageDetails: { input: 100, output: 10, total: 110 },
      costDetails: { total: 0.1 },
    });
    expect(byInput("fast")).toMatchObject({
      model: "model-fast",
      usageDetails: { input: 1, output: 2, total: 3 },
      costDetails: { total: 0.001 },
    });
  });

  it("keeps the trace-metadata model and still ends the generation when onMetrics is never called", async () => {
    const provider = providerReporting(() => ({ model: "unused" }));
    vi.mocked(provider.interpretTextQuery).mockImplementation(async (text: string) => ({
      searchTerms: [text],
      interpretation: text,
    }));
    const wrapped = wrapAIProvider(provider, { provider: "openrouter", textModel: "meta/model" });

    const result = await wrapped.interpretTextQuery("shoes", locales);

    expect(result.searchTerms).toEqual(["shoes"]);
    expect(generations[0]).toMatchObject({ model: "meta/model", output: result });
    expect(generations[0]?.usageDetails).toBeUndefined();
  });

  it("still forwards metrics to the caller's own onMetrics", async () => {
    const provider = providerReporting(() => ({ model: "m", usage: { input: 1, output: 1, total: 2 } }));
    const wrapped = wrapAIProvider(provider, { provider: "openrouter", textModel: "m" });
    const onMetrics = vi.fn();

    await wrapped.interpretTextQuery("shoes", locales, [], { onMetrics });

    expect(onMetrics).toHaveBeenCalledWith({ model: "m", usage: { input: 1, output: 1, total: 2 } });
  });
});
