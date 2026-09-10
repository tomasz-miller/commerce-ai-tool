import { describe, expect, it } from "vitest";
import { dropSoftFilters, hasSoftFilters, relaxInterpretedSearch } from "./relax-search.js";

const base = {
  searchTerms: ["wine glass", "glass"],
  primaryTerm: "wine glass",
  interpretation: "drinkware",
  filters: { color: "red", priceMax: "50", category: "glassware" },
};

describe("hasSoftFilters", () => {
  it("detects color and brand as soft", () => {
    expect(hasSoftFilters({ color: "red" })).toBe(true);
    expect(hasSoftFilters({ priceMax: "20", category: "x" })).toBe(false);
  });
});

describe("dropSoftFilters", () => {
  it("keeps price and category", () => {
    expect(dropSoftFilters(base.filters)).toEqual({ priceMax: "50", category: "glassware" });
  });
});

describe("relaxInterpretedSearch", () => {
  it("drops soft filters on the first relaxation", () => {
    const relaxed = relaxInterpretedSearch(base, "drop_soft_filters");
    expect(relaxed?.filters).toEqual({ priceMax: "50", category: "glassware" });
    expect(relaxed?.searchTerms).toEqual(base.searchTerms);
  });

  it("returns null when there are no soft filters", () => {
    expect(
      relaxInterpretedSearch({ ...base, filters: { priceMax: "50" } }, "drop_soft_filters"),
    ).toBeNull();
  });

  it("narrows to primaryTerm and keeps hard filters on any-match", () => {
    const relaxed = relaxInterpretedSearch(base, "primary_any_match");
    expect(relaxed).toEqual({
      ...base,
      searchTerms: ["wine glass"],
      primaryTerm: "wine glass",
      filters: { priceMax: "50", category: "glassware" },
    });
  });

  it("falls back to the first searchTerm when primaryTerm is missing", () => {
    const relaxed = relaxInterpretedSearch(
      { searchTerms: ["mugs", "cups"], interpretation: "drink" },
      "primary_any_match",
    );
    expect(relaxed?.searchTerms).toEqual(["mugs"]);
    expect(relaxed?.primaryTerm).toBe("mugs");
  });
});
