import { describe, expect, it } from "vitest";
import {
  clampSuggestionsLimit,
  normalizeSuggestionList,
  normalizeSuggestionsPrefix,
  resolveSuggestLocale,
  resolveSuggestLocales,
  shouldUseAiSuggestionFallback,
  suggestionPrefixes,
  filterSuggestionsByQueryTokens,
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
  it("prefers catalog locale over query locale", () => {
    expect(resolveSuggestLocale("pl", "en")).toBe("en");
  });

  it("falls back to query locale when catalog locale is empty", () => {
    expect(resolveSuggestLocale("pl", "")).toBe("pl");
  });
});

describe("resolveSuggestLocales", () => {
  it("returns catalog locale alone when query matches", () => {
    expect(resolveSuggestLocales("en", "en")).toEqual(["en"]);
  });

  it("returns catalog first then query when they differ", () => {
    expect(resolveSuggestLocales("pl", "en")).toEqual(["en", "pl"]);
  });
});

describe("shouldUseAiSuggestionFallback", () => {
  it("is false for short queries", () => {
    expect(shouldUseAiSuggestionFallback("sto", "pl", "en-GB")).toBe(false);
  });

  it("is true when query and catalog locales differ", () => {
    expect(shouldUseAiSuggestionFallback("stol", "pl", "en-GB")).toBe(true);
  });

  it("is true for multi-token same-locale queries", () => {
    expect(shouldUseAiSuggestionFallback("wooden table", "en", "en")).toBe(true);
  });

  it("is false for short same-locale single tokens", () => {
    expect(shouldUseAiSuggestionFallback("glas", "en-GB", "en-GB")).toBe(false);
  });
});

describe("suggestionPrefixes", () => {
  it("returns the full query and the last token for multi-word input", () => {
    expect(suggestionPrefixes("coffee table")).toEqual(["coffee table", "table"]);
  });

  it("returns only the trimmed query for a single token", () => {
    expect(suggestionPrefixes("  table  ")).toEqual(["table"]);
  });
});

describe("filterSuggestionsByQueryTokens", () => {
  it("drops last-token hits that omit earlier query words", () => {
    expect(
      filterSuggestionsByQueryTokens(
        ["Art Deco Coffee Table", "Minimalist Modern Side Table", "White Running Shoes"],
        "coffee table",
      ),
    ).toEqual(["Art Deco Coffee Table"]);
  });
});

describe("normalizeSuggestionList", () => {
  it("trims, dedupes case-insensitively, and clamps", () => {
    expect(
      normalizeSuggestionList([" Wooden Table ", "wooden table", "Wood", ""], 2),
    ).toEqual(["Wooden Table", "Wood"]);
  });

  it("drops description-like suggestions", () => {
    expect(
      normalizeSuggestionList(
        [
          "Chianti Wine Glass",
          "The Chianti Wine Glass is specifically designed to enhance the experience of",
          "Sparkle Champagne Glass",
        ],
        8,
      ),
    ).toEqual(["Chianti Wine Glass", "Sparkle Champagne Glass"]);
  });
});
