import { describe, expect, it } from "vitest";
import {
  isLikelyProductQuery,
  localesShareLanguage,
  mergeInterpretedSearchTerms,
} from "./query-passthrough.js";

describe("isLikelyProductQuery", () => {
  it("accepts short product-type phrases", () => {
    expect(isLikelyProductQuery("coffee table")).toBe(true);
    expect(isLikelyProductQuery("table")).toBe(true);
  });

  it("rejects questions and off-topic prompts", () => {
    expect(isLikelyProductQuery("explain the difference between RAM and SSD")).toBe(false);
    expect(isLikelyProductQuery("what is a coffee table?")).toBe(false);
  });
});

describe("localesShareLanguage", () => {
  it("treats en and en-GB as the same language", () => {
    expect(localesShareLanguage("en", "en-GB")).toBe(true);
    expect(localesShareLanguage("pl", "en-GB")).toBe(false);
  });
});

describe("mergeInterpretedSearchTerms", () => {
  it("uses the typed query when AI returns no phrases", () => {
    expect(
      mergeInterpretedSearchTerms(
        "coffee table",
        { searchTerms: [], interpretation: "none" },
        { queryLocale: "en", catalogLocale: "en-GB" },
      ).searchTerms,
    ).toEqual(["coffee table"]);
  });

  it("ORs the typed query with AI phrases when locales share a language", () => {
    expect(
      mergeInterpretedSearchTerms(
        "coffee table",
        { searchTerms: ["side table"], interpretation: "tables" },
        { queryLocale: "en", catalogLocale: "en-GB" },
      ).searchTerms,
    ).toEqual(["coffee table", "side table"]);
  });

  it("does not inject a cross-locale query into AI phrases", () => {
    expect(
      mergeInterpretedSearchTerms(
        "stolik kawowy",
        { searchTerms: ["coffee table"], interpretation: "tables" },
        { queryLocale: "pl", catalogLocale: "en-GB" },
      ).searchTerms,
    ).toEqual(["coffee table"]);
  });

  it("does not invent terms for off-topic questions", () => {
    expect(
      mergeInterpretedSearchTerms(
        "explain the difference between RAM and SSD",
        { searchTerms: [], interpretation: "not product search" },
        { queryLocale: "en", catalogLocale: "en-GB" },
      ).searchTerms,
    ).toEqual([]);
  });

  it("does not inject a cross-locale query when AI returns no phrases", () => {
    expect(
      mergeInterpretedSearchTerms(
        "stolik kawowy",
        { searchTerms: [], interpretation: "none" },
        { queryLocale: "pl", catalogLocale: "en-GB" },
      ).searchTerms,
    ).toEqual([]);
  });
});
