import { describe, expect, it } from "vitest";
import {
  buildProductSearchBody,
  buildTextQueryUserMessage,
  formatLocaleContext,
  parseInterpretedQuery,
  parseVoiceAudioInterpretation,
} from "./index.js";

describe("formatLocaleContext", () => {
  it("includes query and catalog locales", () => {
    expect(
      formatLocaleContext({ queryLocale: "en", catalogLocale: "no" }),
    ).toContain("User query language: en");
    expect(
      formatLocaleContext({ queryLocale: "en", catalogLocale: "no" }),
    ).toContain("Product catalog language: no");
  });

  it("requires searchTerms in catalog language", () => {
    expect(
      formatLocaleContext({ queryLocale: "pl", catalogLocale: "no" }),
    ).toContain("CRITICAL: searchTerms must use only the catalog language (no)");
  });
});

describe("buildTextQueryUserMessage", () => {
  it("includes locale context and query text", () => {
    const message = buildTextQueryUserMessage("red shoes", {
      queryLocale: "en",
      catalogLocale: "no",
    });
    expect(message).toContain("Query: red shoes");
    expect(message).toContain("catalog language: no");
  });
});

describe("parseInterpretedQuery", () => {
  it("parses valid JSON response", () => {
    const result = parseInterpretedQuery(
      JSON.stringify({
        searchTerms: ["laptop", "dell"],
        sort: "price_asc",
        interpretation: "Looking for Dell laptops",
      }),
    );

    expect(result.searchTerms).toEqual(["laptop", "dell"]);
    expect(result.sort).toBe("price_asc");
    expect(result.interpretation).toBe("Looking for Dell laptops");
  });

  it("throws on invalid response", () => {
    expect(() => parseInterpretedQuery("{}")).toThrow();
  });
});

describe("parseVoiceAudioInterpretation", () => {
  it("parses transcript, enhancedQuery, and search fields", () => {
    const result = parseVoiceAudioInterpretation(
      JSON.stringify({
        transcript: "um, red shoes please",
        enhancedQuery: "red shoes",
        searchTerms: ["røde sko"],
        sort: "relevance",
        interpretation: "Looking for red shoes",
      }),
    );

    expect(result.transcript).toBe("um, red shoes please");
    expect(result.enhancedQuery).toBe("red shoes");
    expect(result.searchTerms).toEqual(["røde sko"]);
    expect(result.interpretation).toBe("Looking for red shoes");
  });

  it("throws when transcript is missing", () => {
    expect(() =>
      parseVoiceAudioInterpretation(
        JSON.stringify({
          enhancedQuery: "red shoes",
          searchTerms: ["røde sko"],
        }),
      ),
    ).toThrow("missing transcript");
  });

  it("throws when enhancedQuery is missing", () => {
    expect(() =>
      parseVoiceAudioInterpretation(
        JSON.stringify({
          transcript: "red shoes",
          searchTerms: ["røde sko"],
        }),
      ),
    ).toThrow("missing enhancedQuery");
  });
});

describe("buildProductSearchBody", () => {
  it("builds fullText query for single term", () => {
    const body = buildProductSearchBody(
      {
        searchTerms: ["shoes"],
        interpretation: "shoes",
        sort: "relevance",
      },
      "no",
      10,
    );

    expect(body.query?.fullText?.value).toBe("shoes");
    expect(body.query?.fullText?.language).toBe("no");
    expect(body.limit).toBe(10);
  });

  it("builds or query for multiple terms", () => {
    const body = buildProductSearchBody(
      {
        searchTerms: ["red", "dress"],
        interpretation: "red dress",
        sort: "relevance",
      },
      "en",
    );

    expect(body.query?.or).toHaveLength(2);
  });
});
