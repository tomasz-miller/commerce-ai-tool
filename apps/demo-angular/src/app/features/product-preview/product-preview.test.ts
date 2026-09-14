import { describe, expect, it } from "vitest";
import {
  PREVIEW_MAX_QUANTITY,
  PREVIEW_MIN_QUANTITY,
  clampPreviewQuantity,
  formatSheetTotal,
} from "./product-preview.js";

describe("product-preview", () => {
  it("clamps the sheet quantity to the supported range", () => {
    expect(clampPreviewQuantity(0)).toBe(PREVIEW_MIN_QUANTITY);
    expect(clampPreviewQuantity(3)).toBe(3);
    expect(clampPreviewQuantity(500)).toBe(PREVIEW_MAX_QUANTITY);
  });

  it("totals the sheet price for the selected quantity", () => {
    expect(
      formatSheetTotal({ amount: 99, currency: "EUR", formatted: "€99.00" }, 2, "en-GB"),
    ).toContain("198");
  });

  it("falls back to the preformatted price when Intl fails", () => {
    expect(
      formatSheetTotal({ amount: 99, currency: "NOPE", formatted: "€99.00" }, 2, "en-GB"),
    ).toBe("€99.00");
  });
});
