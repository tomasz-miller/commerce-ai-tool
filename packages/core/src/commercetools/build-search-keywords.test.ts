import { describe, expect, it } from "vitest";
import {
  buildSearchKeywordsFromProductCopy,
  hasNonEmptySearchKeywords,
} from "./build-search-keywords.js";

describe("hasNonEmptySearchKeywords", () => {
  it("returns false for empty maps and non-arrays", () => {
    expect(hasNonEmptySearchKeywords(undefined)).toBe(false);
    expect(hasNonEmptySearchKeywords({})).toBe(false);
    expect(hasNonEmptySearchKeywords({ "en-GB": [] })).toBe(false);
    expect(hasNonEmptySearchKeywords({ "en-GB": "x" })).toBe(false);
  });

  it("returns true when any locale has keywords", () => {
    expect(
      hasNonEmptySearchKeywords({
        "en-GB": [{ text: "Glass" }],
      }),
    ).toBe(true);
  });
});

describe("buildSearchKeywordsFromProductCopy", () => {
  it("builds name keywords with whitespace tokenizer per locale", () => {
    const result = buildSearchKeywordsFromProductCopy({
      name: {
        "en-GB": "Chianti Wine Glass",
        "de-DE": "Chianti Weinglas",
      },
    });

    expect(result).toEqual({
      status: "ready",
      searchKeywords: {
        "en-GB": [
          {
            text: "Chianti Wine Glass",
            suggestTokenizer: { type: "whitespace" },
          },
        ],
        "de-DE": [
          {
            text: "Chianti Weinglas",
            suggestTokenizer: { type: "whitespace" },
          },
        ],
      },
    });
  });

  it("adds up to two description phrases and dedupes against the name", () => {
    const result = buildSearchKeywordsFromProductCopy({
      name: { "en-GB": "Wine Glass" },
      description: {
        "en-GB":
          "Elegant crystal glass for red wine. Perfect for dinner parties. Extra filler sentence ignored.",
      },
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") {
      return;
    }

    expect(result.searchKeywords["en-GB"]).toEqual([
      {
        text: "Wine Glass",
        suggestTokenizer: { type: "whitespace" },
      },
      {
        text: "Elegant crystal glass for red wine",
        suggestTokenizer: { type: "whitespace" },
      },
      {
        text: "Perfect for dinner parties",
        suggestTokenizer: { type: "whitespace" },
      },
    ]);
  });

  it("skips when keywords already exist unless force is set", () => {
    const existing = { "en-GB": [{ text: "Already" }] };

    expect(
      buildSearchKeywordsFromProductCopy({
        name: { "en-GB": "Glass" },
        existingSearchKeywords: existing,
      }),
    ).toEqual({ status: "skip", reason: "existing" });

    const forced = buildSearchKeywordsFromProductCopy({
      name: { "en-GB": "Glass" },
      existingSearchKeywords: existing,
      force: true,
    });

    expect(forced).toEqual({
      status: "ready",
      searchKeywords: {
        "en-GB": [
          {
            text: "Glass",
            suggestTokenizer: { type: "whitespace" },
          },
        ],
      },
    });
  });

  it("skips when there is no usable name copy", () => {
    expect(
      buildSearchKeywordsFromProductCopy({
        name: { "en-GB": " " },
        description: { "en-GB": "Only description" },
      }),
    ).toEqual({ status: "skip", reason: "empty" });
  });

  it("ignores stopword-only description fragments", () => {
    const result = buildSearchKeywordsFromProductCopy({
      name: { "en-GB": "Mug" },
      description: { "en-GB": "The and of. Real ceramic mug body." },
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") {
      return;
    }

    expect(result.searchKeywords["en-GB"]?.map((item) => item.text)).toEqual([
      "Mug",
      "Real ceramic mug body",
    ]);
  });
});
