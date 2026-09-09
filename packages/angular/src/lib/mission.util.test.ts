import { describe, expect, it } from "vitest";
import type { MissionSearchResult } from "@commerce-ai-tool/core";
import {
  formatMissionAddAll,
  lineItemKey,
  starterBundleItems,
  toCartItem,
} from "./mission.util.js";

const mission: MissionSearchResult = {
  interpretation: "racket and balls",
  intents: [
    {
      intent: {
        id: "intent-0",
        label: "tennis racket",
        quantity: 1,
        searchTerms: ["tennis racket"],
      },
      products: [
        { id: "p1", name: "Pro Racket", sku: "RACKET-1" },
        { id: "p2", name: "Club Racket", sku: "RACKET-2" },
      ],
      total: 2,
    },
    {
      intent: {
        id: "intent-1",
        label: "golf balls",
        quantity: 2,
        searchTerms: ["golf balls"],
      },
      products: [{ id: "p3", name: "Tour Balls", sku: "BALL-1" }],
      total: 1,
    },
  ],
};

describe("mission.util", () => {
  it("takes the first product from each filled lane at quantity 1", () => {
    expect(starterBundleItems(mission)).toEqual([
      { sku: "RACKET-1", quantity: 1 },
      { sku: "BALL-1", quantity: 1 },
    ]);
  });

  it("skips empty and failed lanes and dedupes duplicate first products", () => {
    expect(
      starterBundleItems({
        interpretation: "mixed",
        intents: [
          {
            intent: { id: "intent-0", label: "glasses", quantity: 1, searchTerms: ["glasses"] },
            products: [{ id: "p1", name: "Wine Glass", sku: "GLASS-1" }],
            total: 1,
          },
          {
            intent: { id: "intent-1", label: "missing", quantity: 1, searchTerms: ["missing"] },
            products: [],
            total: 0,
          },
          {
            intent: { id: "intent-2", label: "failed", quantity: 1, searchTerms: ["failed"] },
            products: [],
            total: 0,
            failed: true,
          },
          {
            intent: { id: "intent-3", label: "more glasses", quantity: 1, searchTerms: ["glasses"] },
            products: [{ id: "p9", name: "Same Glass", sku: "GLASS-1" }],
            total: 1,
          },
        ],
      }),
    ).toEqual([{ sku: "GLASS-1", quantity: 1 }]);
  });

  it("prefers sku over product id when building a cart item", () => {
    expect(toCartItem({ id: "p1", name: "Racket", sku: "RACKET-1", variantId: 2 }, 1)).toEqual({
      sku: "RACKET-1",
      quantity: 1,
    });
    expect(toCartItem({ id: "p1", name: "Racket", variantId: 2 }, 1)).toEqual({
      productId: "p1",
      variantId: 2,
      quantity: 1,
    });
  });

  it("formats singular and plural add-all labels", () => {
    expect(formatMissionAddAll("Add {count} top picks to cart", 2)).toBe("Add 2 top picks to cart");
    expect(formatMissionAddAll("Add {count} top picks to cart", 1)).toBe("Add 1 top pick to cart");
  });

  it("keys line items by sku when present", () => {
    expect(lineItemKey({ sku: "GLASS-1", quantity: 1 })).toBe("sku:GLASS-1");
    expect(lineItemKey({ productId: "p1", variantId: 2, quantity: 1 })).toBe("id:p1:2");
  });
});
