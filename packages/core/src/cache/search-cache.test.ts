import { describe, expect, it, vi } from "vitest";
import {
  SearchCache,
  buildImageSearchCacheKey,
  buildSuggestionsCacheKey,
  buildTextSearchCacheKey,
  buildVoiceSearchCacheKey,
  normalizeCacheKeyPart,
} from "./search-cache.js";

describe("SearchCache", () => {
  it("stores and retrieves values before TTL expiry", () => {
    const cache = new SearchCache<string>({ ttlMs: 60_000 });
    cache.set("key", "value");
    expect(cache.get("key")).toBe("value");
  });

  it("expires entries after TTL", () => {
    vi.useFakeTimers();
    const cache = new SearchCache<string>({ ttlMs: 1_000 });
    cache.set("key", "value");

    vi.advanceTimersByTime(1_001);
    expect(cache.get("key")).toBeUndefined();

    vi.useRealTimers();
  });
});

describe("normalizeCacheKeyPart", () => {
  it("normalizes whitespace and case", () => {
    expect(normalizeCacheKeyPart("  Red   Shoes ")).toBe("red shoes");
  });
});

describe("buildTextSearchCacheKey", () => {
  it("includes query locales and limit", () => {
    expect(buildTextSearchCacheKey("Red Shoes", "en", "no", 20)).toBe(
      "text|red shoes|en|no|20",
    );
  });
});

describe("buildSuggestionsCacheKey", () => {
  it("includes prefix, locale, and limit", () => {
    expect(buildSuggestionsCacheKey("Red", "en", 8)).toBe("suggest|red|en|8");
  });
});

describe("buildImageSearchCacheKey", () => {
  it("includes image hash and locales", () => {
    expect(buildImageSearchCacheKey("abc123", "image/jpeg", "en", "no", 20)).toBe(
      "image|abc123|image/jpeg|en|no|20",
    );
  });
});

describe("buildVoiceSearchCacheKey", () => {
  it("includes audio hash and voice mode", () => {
    expect(buildVoiceSearchCacheKey("hash", "audio/webm", "openrouter-audio", "en", "no", 20, true)).toBe(
      "voice|openrouter-audio|tts|hash|audio/webm|en|no|20",
    );
    expect(buildVoiceSearchCacheKey("hash", "audio/webm", "openrouter-audio", "en", "no", 20, false)).toBe(
      "voice|openrouter-audio|no-tts|hash|audio/webm|en|no|20",
    );
  });
});
