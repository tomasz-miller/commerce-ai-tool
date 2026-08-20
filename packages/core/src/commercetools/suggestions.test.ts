import { describe, expect, it } from "vitest";
import { normalizeSearchSuggestions } from "./suggestions.js";

describe("normalizeSearchSuggestions", () => {
  it("extracts suggestion text for the requested locale", () => {
    const result = normalizeSearchSuggestions(
      {
        "searchKeywords.en": [{ text: "Red Shoes" }, { text: "Running Shoes" }],
      },
      "en",
      8,
    );

    expect(result).toEqual(["Red Shoes", "Running Shoes"]);
  });

  it("merges multiple locales with catalog order and dedupe", () => {
    const result = normalizeSearchSuggestions(
      {
        "searchKeywords.en": [{ text: "Glasses" }],
        "searchKeywords.pl": [{ text: "Okulary" }, { text: "glasses" }],
      },
      ["en", "pl"],
      8,
    );

    expect(result).toEqual(["Glasses", "Okulary"]);
  });

  it("deduplicates case-insensitively and respects the limit", () => {
    const result = normalizeSearchSuggestions(
      {
        "searchKeywords.en": [
          { text: "Red Shoes" },
          { text: "red shoes" },
          { text: "Blue Shoes" },
        ],
      },
      "en",
      2,
    );

    expect(result).toEqual(["Red Shoes", "Blue Shoes"]);
  });

  it("skips description-like phrases while filling the limit with names", () => {
    const result = normalizeSearchSuggestions(
      {
        "searchKeywords.en": [
          {
            text: "The Chianti Wine Glass is specifically designed to enhance the experience of",
          },
          { text: "Chianti Wine Glass" },
          {
            text: "A tapered champagne glass, also known as a champagne flute, is a type of",
          },
          { text: "Sparkle Champagne Glass" },
        ],
      },
      "en",
      8,
    );

    expect(result).toEqual(["Chianti Wine Glass", "Sparkle Champagne Glass"]);
  });

  it("returns an empty array when the locale bucket is missing", () => {
    expect(normalizeSearchSuggestions({}, "en", 8)).toEqual([]);
  });
});
