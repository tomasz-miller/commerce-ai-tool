import { describe, expect, it } from "vitest";
import {
  buildProjectionSearchQueryArgs,
  extractMatchedSkus,
  extractProductSearchIds,
  extractSearchTerms,
  isProductSearchUnavailable,
} from "./search-helpers.js";
import { buildProductSearchRequest } from "./query-builder.js";

describe("extractProductSearchIds", () => {
  it("reads id from Product Search API results", () => {
    expect(
      extractProductSearchIds([
        { id: "product-1" },
        { id: "product-2" },
      ]),
    ).toEqual(["product-1", "product-2"]);
  });

  it("falls back to deprecated productProjection.id", () => {
    expect(
      extractProductSearchIds([
        { productProjection: { id: "legacy-projection-id" } },
      ]),
    ).toEqual(["legacy-projection-id"]);
  });
});

describe("extractSearchTerms", () => {
  it("extracts phrase from multi-field product search body", () => {
    const body = buildProductSearchRequest({
      interpreted: {
        searchTerms: ["jacket"],
        interpretation: "jacket",
      },
      catalogLocale: "en",
    });

    expect(extractSearchTerms(body)).toEqual({ terms: ["jacket"], locale: "en" });
  });

  it("extracts unique phrases from an OR of alternative search terms", () => {
    const body = buildProductSearchRequest({
      interpreted: {
        searchTerms: ["glasses", "mugs"],
        interpretation: "something to drink from",
      },
      catalogLocale: "en-GB",
    });

    expect(extractSearchTerms(body)).toEqual({ terms: ["glasses", "mugs"], locale: "en-GB" });
  });
});

describe("buildProjectionSearchQueryArgs", () => {
  it("maps text search to projection search query args", () => {
    expect(
      buildProjectionSearchQueryArgs({
        interpreted: {
          searchTerms: ["jacket"],
          interpretation: "jacket",
          sort: "price_asc",
        },
        catalogLocale: "en",
        limit: 10,
        offset: 5,
        options: { currency: "EUR" },
      }),
    ).toEqual({
      limit: 10,
      offset: 5,
      localeProjection: "en",
      fuzzy: true,
      "text.en": "jacket",
      priceCurrency: "EUR",
      sort: "price asc",
    });
  });
});

describe("isProductSearchUnavailable", () => {
  it("detects URI not found errors", () => {
    expect(
      isProductSearchUnavailable(new Error("URI not found: /easmith-dev/products/search")),
    ).toBe(true);
  });

  it("detects ObjectNotFound API errors", () => {
    expect(
      isProductSearchUnavailable({
        body: { message: "Product Search API is not enabled for \"demo\"" },
      }),
    ).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isProductSearchUnavailable(new Error("Unauthorized"))).toBe(false);
  });
});

describe("extractMatchedSkus", () => {
  it("maps each partially matched product to its first matched sku", () => {
    expect(
      extractMatchedSkus([
        {
          id: "p1",
          matchingVariants: {
            allMatched: false,
            matchedVariants: [
              { id: 3, sku: "RED-42" },
              { id: 4, sku: "RED-43" },
            ],
          },
        },
        { id: "p2", matchingVariants: { allMatched: true, matchedVariants: [] } },
        { id: "p3", matchingVariants: { allMatched: false, matchedVariants: [{ id: 2 }] } },
        { id: "p4" },
      ]),
    ).toEqual({ p1: "RED-42" });
  });
});
