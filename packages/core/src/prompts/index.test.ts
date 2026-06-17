import { describe, expect, it } from "vitest";
import { buildProductSearchBody, parseInterpretedQuery } from "./index.js";

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

describe("buildProductSearchBody", () => {
  it("builds fullText query for single term", () => {
    const body = buildProductSearchBody(
      {
        searchTerms: ["shoes"],
        interpretation: "shoes",
        sort: "relevance",
      },
      "en",
      10,
    );

    expect(body.query?.fullText?.value).toBe("shoes");
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
