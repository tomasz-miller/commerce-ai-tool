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

  it("parses standardized filters", () => {
    const result = parseInterpretedQuery(
      JSON.stringify({
        searchTerms: ["sko"],
        filters: { color: "red", priceMax: "200" },
        interpretation: "red shoes under 200",
      }),
    );

    expect(result.filters).toEqual({ color: "red", priceMax: "200" });
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

  it("parses fenced and truncated voice JSON payloads", () => {
    const result = parseVoiceAudioInterpretation(
      '```json\n{"transcript":"czerwone buty","enhancedQuery":"czerwone buty","searchTerms":["sko"],"interpretation":"Looking for',
    );

    expect(result.transcript).toBe("czerwone buty");
    expect(result.enhancedQuery).toBe("czerwone buty");
    expect(result.searchTerms).toEqual(["sko"]);
  });
});

describe("buildProductSearchBody", () => {
  it("builds multi-field fullText query for a single phrase", () => {
    const body = buildProductSearchBody(
      {
        searchTerms: ["shoes"],
        interpretation: "shoes",
        sort: "relevance",
      },
      "no",
      10,
    );

    expect(body.limit).toBe(10);
    expect(body.query).toMatchObject({
      or: expect.arrayContaining([
        expect.objectContaining({
          fullText: expect.objectContaining({
            value: "shoes",
            language: "no",
            mustMatch: "all",
          }),
        }),
      ]),
    });
  });

  it("joins multiple terms into one phrase", () => {
    const body = buildProductSearchBody(
      {
        searchTerms: ["red", "dress"],
        interpretation: "red dress",
        sort: "relevance",
      },
      "en",
    );

    const orClause = (body.query as {
      or?: Array<{ fullText?: { value?: string }; fuzzy?: { value?: string } }>;
    }).or;
    const values = orClause?.map((clause) => clause.fullText?.value ?? clause.fuzzy?.value);
    expect(values?.every((value) => value === "red dress")).toBe(true);
  });

  it("includes filter expressions in the query", () => {
    const body = buildProductSearchBody(
      {
        searchTerms: ["sko"],
        filters: { color: "red" },
        interpretation: "red shoes",
        sort: "relevance",
      },
      "no",
      10,
      0,
      { currency: "NOK" },
    );

    expect(JSON.stringify(body.query)).toContain("variants.attributes.color.key");
  });
});
