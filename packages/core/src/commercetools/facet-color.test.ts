import { describe, expect, it } from "vitest";
import {
  formatFacetBucketLabel,
  hexColorSwatchValue,
  isColorLikeFacetName,
  isHexColorFacetKey,
} from "./facet-color.js";

describe("facet color labels", () => {
  it("detects #RGB and #RRGGBB keys only", () => {
    expect(isHexColorFacetKey("#FFFFFF")).toBe(true);
    expect(isHexColorFacetKey("#fff")).toBe(true);
    expect(isHexColorFacetKey("#8b4513")).toBe(true);
    expect(isHexColorFacetKey("red")).toBe(false);
    expect(isHexColorFacetKey("FFFFFF")).toBe(false);
    expect(isHexColorFacetKey("#GGGGGG")).toBe(false);
  });

  it("maps catalog hex values from furniture attributes to CSS color names", () => {
    expect(formatFacetBucketLabel("#8b4513")).toBe("Saddle Brown");
    expect(formatFacetBucketLabel("#FFD700")).toBe("Gold");
    expect(formatFacetBucketLabel("#FFFFFF")).toBe("White");
    expect(formatFacetBucketLabel("#2F4F4F")).toBe("Dark Slate Gray");
    expect(formatFacetBucketLabel("#DAA520")).toBe("Goldenrod");
    expect(formatFacetBucketLabel("#fff")).toBe("White");
  });

  it("leaves non-hex facet keys unchanged", () => {
    expect(formatFacetBucketLabel("red")).toBe("red");
    expect(formatFacetBucketLabel("under-50")).toBe("under-50");
  });

  it("picks the nearest named color for off-palette hex values", () => {
    expect(formatFacetBucketLabel("#8b4514")).toBe("Saddle Brown");
  });

  it("keeps far hex values instead of a misleading CSS name", () => {
    expect(formatFacetBucketLabel("#808050", "color-code")).toBe("#808050");
  });

  it("only renames hex keys on color or finish facets", () => {
    expect(isColorLikeFacetName("color-code")).toBe(true);
    expect(isColorLikeFacetName("finish-code")).toBe(true);
    expect(isColorLikeFacetName("sku")).toBe(false);
    expect(isColorLikeFacetName("unfinished-wood")).toBe(false);
    expect(formatFacetBucketLabel("#FFFFFF", "sku")).toBe("#FFFFFF");
    expect(formatFacetBucketLabel("#FFFFFF", "color-code")).toBe("White");
    expect(formatFacetBucketLabel("#8b4513", "finish-code")).toBe("Saddle Brown");
  });

  it("normalizes swatch values to six-digit hex", () => {
    expect(hexColorSwatchValue("#FFF")).toBe("#ffffff");
    expect(hexColorSwatchValue("#8b4513")).toBe("#8b4513");
    expect(hexColorSwatchValue("red")).toBeUndefined();
  });
});
