import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isLangfuseEnabled,
  shouldExposeTraceId,
  shouldTraceSuggestions,
} from "./enabled.js";
import { redactBase64ImageInput, redactBinaryInput } from "./redact.js";
import { wrapAIProvider } from "./wrap-ai-provider.js";
import type { AIProvider } from "../ai/types.js";

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
    };
  }

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
    );
  });
});
