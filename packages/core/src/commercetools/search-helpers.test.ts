import { describe, expect, it } from "vitest";
import {
  buildProjectionSearchQueryArgs,
  extractProductSearchIds,
  extractSearchTerms,
  isProductSearchUnavailable,
} from "./search-helpers.js";

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
  it("extracts a single fullText query", () => {
    expect(
      extractSearchTerms({
        query: {
          fullText: { field: "name", language: "en", value: "shoes" },
        },
      }),
    ).toEqual({ terms: ["shoes"], locale: "en" });
  });

  it("extracts OR terms", () => {
    expect(
      extractSearchTerms({
        query: {
          or: [
            { fullText: { field: "name", language: "de", value: "schuhe" } },
            { fullText: { field: "name", language: "de", value: "sneaker" } },
          ],
        },
      }),
    ).toEqual({ terms: ["schuhe", "sneaker"], locale: "de" });
  });
});

describe("buildProjectionSearchQueryArgs", () => {
  it("maps text search to projection search query args", () => {
    expect(
      buildProjectionSearchQueryArgs(
        {
          limit: 10,
          offset: 5,
          query: {
            fullText: { field: "name", language: "en", value: "jacket" },
          },
          sort: [{ field: "variants.prices.centAmount", order: "asc" }],
        },
        "EUR",
      ),
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
