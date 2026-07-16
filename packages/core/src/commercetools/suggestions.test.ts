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

  it("returns an empty array when the locale bucket is missing", () => {
    expect(normalizeSearchSuggestions({}, "en", 8)).toEqual([]);
  });
});
