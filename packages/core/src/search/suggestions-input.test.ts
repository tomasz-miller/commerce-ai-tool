import { describe, expect, it } from "vitest";
import {
  clampSuggestionsLimit,
  normalizeSuggestionsPrefix,
  resolveSuggestLocale,
  SUGGESTIONS_MAX_PREFIX_LENGTH,
} from "./suggestions-input.js";
import {
  SUGGESTIONS_DEFAULT_LIMIT,
  SUGGESTIONS_MAX_LIMIT,
} from "../types/index.js";

describe("clampSuggestionsLimit", () => {
  it("returns default when limit is omitted", () => {
    expect(clampSuggestionsLimit()).toBe(SUGGESTIONS_DEFAULT_LIMIT);
  });

  it("clamps invalid and out-of-range values", () => {
    expect(clampSuggestionsLimit(0)).toBe(1);
    expect(clampSuggestionsLimit(-5)).toBe(1);
    expect(clampSuggestionsLimit(Number.NaN)).toBe(SUGGESTIONS_DEFAULT_LIMIT);
    expect(clampSuggestionsLimit(99)).toBe(SUGGESTIONS_MAX_LIMIT);
  });
});

describe("normalizeSuggestionsPrefix", () => {
  it("returns null for prefixes shorter than the minimum", () => {
    expect(normalizeSuggestionsPrefix("a")).toBeNull();
    expect(normalizeSuggestionsPrefix("  ")).toBeNull();
  });

  it("trims and truncates long prefixes", () => {
    const longPrefix = "x".repeat(SUGGESTIONS_MAX_PREFIX_LENGTH + 10);
    const normalized = normalizeSuggestionsPrefix(`  ${longPrefix}  `);

    expect(normalized).toHaveLength(SUGGESTIONS_MAX_PREFIX_LENGTH);
    expect(normalized?.startsWith("x")).toBe(true);
  });
});

describe("resolveSuggestLocale", () => {
  it("prefers query locale over catalog locale", () => {
    expect(resolveSuggestLocale("en", "no")).toBe("en");
  });

  it("falls back to catalog locale when query locale is empty", () => {
    expect(resolveSuggestLocale("", "no")).toBe("no");
  });
});
