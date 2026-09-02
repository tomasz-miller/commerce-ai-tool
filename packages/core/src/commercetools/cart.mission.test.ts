import { describe, expect, it, vi } from "vitest";
import type { Cart, CartUpdateAction } from "@commercetools/platform-sdk";
import { createCartOperations, type CartGateway } from "./cart.js";

function money(centAmount: number, currencyCode = "EUR") {
  return {
    type: "centPrecision" as const,
    centAmount,
    currencyCode,
    fractionDigits: 2,
  };
}

function createCart(overrides: Partial<Cart> = {}): Cart {
  return {
    id: "cart-1",
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    lastModifiedAt: "2026-01-01T00:00:00.000Z",
    lineItems: [],
    customLineItems: [],
    totalPrice: money(0),
    taxMode: "Platform",
    taxRoundingMode: "HalfEven",
    taxCalculationMode: "LineItemLevel",
    inventoryMode: "None",
    cartState: "Active",
    shippingMode: "Single",
    shipping: [],
    itemShippingAddresses: [],
    discountTypeCombination: { type: "Stacking" },
    refusedGifts: [],
    origin: "Customer",
    totalLineItemQuantity: 0,
    anonymousId: "anon-1",
    ...overrides,
  } as Cart;
}

function createGateway(overrides: Partial<CartGateway> = {}): CartGateway {
  return {
    queryCarts: vi.fn().mockResolvedValue([]),
    getCartById: vi.fn(),
    createCart: vi.fn(),
    updateCart: vi.fn(),
    loginCustomer: vi.fn(),
    ...overrides,
  };
}

describe("addItemsToCart", () => {
  it("adds multiple line items in one update", async () => {
    const existing = createCart();
    const updated = createCart({ version: 2 });
    const gateway = createGateway({
      queryCarts: vi.fn().mockResolvedValue([existing]),
      updateCart: vi.fn().mockResolvedValue(updated),
    });
    const ops = createCartOperations(gateway);

    const snapshot = await ops.addItemsToCart({
      anonymousId: "anon-1",
      catalogLocale: "en",
      items: [
        { sku: "RACKET-1", quantity: 1 },
        { sku: "BALL-1", quantity: 2 },
      ],
    });

    expect(gateway.updateCart).toHaveBeenCalledWith("cart-1", 1, [
      { action: "addLineItem", sku: "RACKET-1", quantity: 1 },
      { action: "addLineItem", sku: "BALL-1", quantity: 2 },
    ]);
    expect(snapshot.version).toBe(2);
  });

  it("retries all addLineItem actions without country when the scoped price is missing", async () => {
    const existing = createCart();
    const updated = createCart({ version: 2 });
    const missingPrice = {
      statusCode: 400,
      body: { errors: [{ code: "MatchingPriceNotFound" }] },
    };
    const updateCart = vi
      .fn<(id: string, version: number, actions: CartUpdateAction[]) => Promise<Cart>>()
      .mockRejectedValueOnce(missingPrice)
      .mockResolvedValueOnce(updated);
    const gateway = createGateway({
      queryCarts: vi.fn().mockResolvedValue([existing]),
      updateCart,
    });
    const ops = createCartOperations(gateway);

    await ops.addItemsToCart({
      anonymousId: "anon-1",
      country: "DE",
      catalogLocale: "en",
      items: [
        { sku: "RACKET-1", quantity: 1 },
        { sku: "BALL-1", quantity: 2 },
      ],
    });

    expect(updateCart).toHaveBeenNthCalledWith(1, "cart-1", 1, [
      { action: "setCountry", country: "DE" },
      { action: "addLineItem", sku: "RACKET-1", quantity: 1 },
      { action: "addLineItem", sku: "BALL-1", quantity: 2 },
    ]);
    expect(updateCart).toHaveBeenNthCalledWith(2, "cart-1", 1, [
      { action: "addLineItem", sku: "RACKET-1", quantity: 1 },
      { action: "addLineItem", sku: "BALL-1", quantity: 2 },
    ]);
  });
});
