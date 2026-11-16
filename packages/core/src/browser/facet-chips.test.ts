import { describe, expect, it } from "vitest";
import type { SearchFacetGroup } from "../types/index.js";
import { selectedFacetChips, trackChipGroups } from "./facet-chips.js";

const facets: SearchFacetGroup[] = [
  {
    id: "color",
    label: "Color",
    type: "distinct",
    buckets: [
      { key: "red", label: "Red", count: 3 },
      { key: "blue", label: "Blue", count: 2 },
    ],
  },
  { id: "size", label: "Size", type: "distinct", buckets: [{ key: "M", label: "M", count: 4 }] },
  { id: "categories", label: "Category", type: "distinct", buckets: [{ key: "cat-1", label: "Shoes", count: 5 }] },
];

describe("facet chips", () => {
  it("does not track a filter the model echoed back", () => {
    expect([...trackChipGroups(new Set(), facets, { color: "red" }, { color: "red" })]).toEqual([]);
  });

  it("tracks a group whose selection the shopper changed", () => {
    expect([...trackChipGroups(new Set(), facets, { color: "red" }, { color: "red", size: "M" })]).toEqual([
      "size",
    ]);
  });

  it("drops a group that is no longer selected", () => {
    expect([...trackChipGroups(new Set(["size"]), facets, { size: "M" }, {})]).toEqual([]);
  });

  it("lists tracked, still selected groups with their keys, categories included", () => {
    const filters = { color: "red", size: "M", category: "cat-1" };
    expect(selectedFacetChips(facets, filters, new Set(["size", "categories"]))).toEqual({
      size: ["M"],
      categories: ["cat-1"],
    });
  });

  it("returns undefined when no tracked group is selected", () => {
    expect(selectedFacetChips(facets, { color: "red" }, new Set())).toBeUndefined();
    expect(selectedFacetChips(facets, {}, new Set(["size"]))).toBeUndefined();
  });
});
