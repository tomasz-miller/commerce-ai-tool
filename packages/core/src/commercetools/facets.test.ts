import { describe, expect, it } from "vitest";
import {
  buildProductSearchFacets,
  buildProjectionFacetParams,
  filterFacetSuggestions,
  isFacetFilterSelected,
  normalizeProductSearchFacets,
  priceBucketKeyFromFilters,
  priceRangeToFilterValues,
  toggleFacetFilter,
} from "./facets.js";

const schema = {
  attributes: [
    {
      name: "color",
      label: "Color",
      kind: "distinct" as const,
      attributeType: "enum" as const,
      field: "variants.attributes.color.key",
      fieldType: "enum",
    },
  ],
  systemFacets: ["categories", "price"] as Array<"categories" | "price">,
  etag: "test",
  resolvedAt: "2026-01-01T00:00:00.000Z",
};

describe("facet helpers", () => {
  it("whitelists AI suggestions against the resolved schema", () => {
    expect(
      filterFacetSuggestions(
        [{ name: "color" }, { name: "unknown" }, { name: "price" }],
        schema,
      ),
    ).toEqual([{ name: "color" }, { name: "price" }]);
  });

  it("builds CT facet definitions for suggested attributes", () => {
    expect(buildProductSearchFacets(schema, [{ name: "color" }])).toEqual([
      expect.objectContaining({
        distinct: expect.objectContaining({ field: "variants.attributes.color.key" }),
      }),
    ]);
  });

  it("builds projection facet expressions including price ranges", () => {
    expect(buildProjectionFacetParams(schema, [{ name: "color" }, { name: "price" }])).toEqual([
      "variants.attributes.color.key as color",
      "variants.prices.centAmount:range (* to 5000), (5000 to 10000), (10000 to *) as price",
    ]);
  });

  it("normalizes returned facet buckets for the widget", () => {
    expect(
      normalizeProductSearchFacets(
        [{ name: "color", buckets: [{ key: "red", count: 3 }] }],
        schema,
        [{ name: "color" }],
        { color: "red" },
      ),
    ).toEqual([
      {
        id: "color",
        label: "Color",
        type: "distinct",
        buckets: [{ key: "red", label: "red", count: 3 }],
        selectedKey: "red",
      },
    ]);
  });

  it("normalizes Product Projection Search term facets", () => {
    expect(
      normalizeProductSearchFacets(
        {
          color: {
            type: "terms",
            terms: [{ term: "blue", count: 2 }],
          },
        },
        schema,
        [{ name: "color" }],
      ),
    ).toEqual([
      {
        id: "color",
        label: "Color",
        type: "distinct",
        buckets: [{ key: "blue", label: "blue", count: 2 }],
      },
    ]);
  });

  it("maps price bucket keys to priceMin/priceMax filters", () => {
    expect(priceRangeToFilterValues({ key: "under-50", to: 5_000 })).toEqual({ priceMax: "50" });
    expect(priceRangeToFilterValues({ key: "50-to-100", from: 5_000, to: 10_000 })).toEqual({
      priceMin: "50",
      priceMax: "100",
    });
    expect(toggleFacetFilter({}, "price", "under-50")).toEqual({ priceMax: "50" });
    expect(toggleFacetFilter({ priceMax: "50" }, "price", "under-50")).toEqual({});
    expect(priceBucketKeyFromFilters({ priceMin: "50", priceMax: "100" })).toBe("50-to-100");
    expect(isFacetFilterSelected({ priceMax: "50" }, "price", "under-50")).toBe(true);
  });

  it("maps category chips to the category filter key", () => {
    expect(toggleFacetFilter({}, "categories", "cat-1")).toEqual({ category: "cat-1" });
    expect(isFacetFilterSelected({ category: "cat-1" }, "categories", "cat-1")).toBe(true);
  });

  it("selects price facet from priceMin/priceMax when normalizing", () => {
    expect(
      normalizeProductSearchFacets(
        [
          {
            name: "price",
            buckets: [
              { key: "under-50", count: 1 },
              { key: "50-to-100", count: 2 },
            ],
          },
        ],
        schema,
        [{ name: "price" }],
        { priceMax: "50" },
      )[0]?.selectedKey,
    ).toBe("under-50");
  });
});
