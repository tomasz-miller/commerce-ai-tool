import { describe, expect, it, vi } from "vitest";
import type { Cart, CartUpdateAction } from "@commercetools/platform-sdk";
import {
  buildAnonymousCartWhere,
  buildCustomerCartWhere,
  CartAccessDeniedError,
  CartNotFoundError,
  createCartOperations,
  escapePredicateString,
  formatMoney,
  InvalidCredentialsError,
  isConcurrentModification,
  mapCartToSnapshot,
  resolveLineItemDraft,
  type CartGateway,
} from "./cart.js";

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
    lineItems: [
      {
        id: "li-1",
        productId: "p-1",
        name: { en: "Red Shoe", no: "Rød sko" },
        productType: { typeId: "product-type", id: "pt-1" },
        variant: {
          id: 1,
          sku: "SHOE-RED",
          images: [{ url: "https://cdn.example/shoe.jpg", dimensions: { w: 1, h: 1 } }],
        },
        price: {
          id: "price-1",
          value: money(4999),
        },
        quantity: 2,
        totalPrice: money(9998),
        discountedPricePerQuantity: [],
        taxedPricePortions: [],
        state: [],
        perMethodTaxRate: [],
        priceMode: "Platform",
        lineItemMode: "Standard",
      },
    ],
    customLineItems: [],
    totalPrice: money(9998),
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
    totalLineItemQuantity: 2,
    anonymousId: "anon-1",
    ...overrides,
  } as Cart;
}

function createGateway(overrides: Partial<CartGateway> = {}): CartGateway {
  return {
    queryCarts: vi.fn().mockResolvedValue([]),
    getCartById: vi.fn().mockResolvedValue(createCart()),
    createCart: vi.fn().mockResolvedValue(createCart()),
    updateCart: vi.fn().mockResolvedValue(createCart({ version: 2 })),
    loginCustomer: vi.fn(),
    ...overrides,
  };
}

describe("cart helpers", () => {
  it("escapes query predicate strings", () => {
    expect(escapePredicateString('a"b\\c')).toBe('a\\"b\\\\c');
  });

  it("builds an anonymous active-cart where clause", () => {
    expect(buildAnonymousCartWhere("anon-1")).toBe(
      'anonymousId="anon-1" and cartState="Active"',
    );
  });

  it("builds a customer active-cart where clause", () => {
    expect(buildCustomerCartWhere("cust-1")).toBe(
      'customerId="cust-1" and cartState="Active"',
    );
  });

  it("formats cent precision money", () => {
    expect(formatMoney({ centAmount: 12345, currencyCode: "EUR", fractionDigits: 2 }, "en")).toEqual(
      {
        amount: 123.45,
        currency: "EUR",
        formatted: new Intl.NumberFormat("en", { style: "currency", currency: "EUR" }).format(123.45),
      },
    );
  });

  it("maps a commercetools cart to a client snapshot", () => {
    const snapshot = mapCartToSnapshot(createCart(), "no");

    expect(snapshot).toMatchObject({
      id: "cart-1",
      version: 1,
      anonymousId: "anon-1",
      totalQuantity: 2,
      lineItems: [
        {
          id: "li-1",
          name: "Rød sko",
          sku: "SHOE-RED",
          productId: "p-1",
          quantity: 2,
          imageUrl: "https://cdn.example/shoe.jpg",
        },
      ],
    });
    expect(snapshot.totalPrice.amount).toBe(99.98);
    expect(snapshot.lineItems[0]?.price?.amount).toBe(49.99);
  });

  it("detects concurrent modification errors", () => {
    expect(isConcurrentModification({ statusCode: 409 })).toBe(true);
    expect(
      isConcurrentModification({ body: { errors: [{ code: "ConcurrentModification" }] } }),
    ).toBe(true);
    expect(isConcurrentModification({ statusCode: 400 })).toBe(false);
  });

  it("defaults add-to-cart quantity to 1", () => {
    expect(resolveLineItemDraft({ anonymousId: "a", sku: "SKU-1" })).toEqual({
      sku: "SKU-1",
      productId: undefined,
      variantId: undefined,
      quantity: 1,
    });
  });

  it("prefers sku over productId when both are provided", () => {
    expect(
      resolveLineItemDraft({
        anonymousId: "a",
        sku: "SKU-1",
        productId: "p-1",
        variantId: 2,
      }),
    ).toEqual({
      sku: "SKU-1",
      productId: undefined,
      variantId: undefined,
      quantity: 1,
    });
  });
});

describe("createCartOperations", () => {
  it("returns null when no active cart exists", async () => {
    const gateway = createGateway();
    const ops = createCartOperations(gateway);

    await expect(ops.getCart("anon-1", "en")).resolves.toBeNull();
    expect(gateway.queryCarts).toHaveBeenCalledWith(
      'anonymousId="anon-1" and cartState="Active"',
    );
  });

  it("creates a cart with the first line item when none exists", async () => {
    const created = createCart({ version: 1 });
    const gateway = createGateway({
      createCart: vi.fn().mockResolvedValue(created),
    });
    const ops = createCartOperations(gateway);

    const snapshot = await ops.addToCart({
      anonymousId: "anon-1",
      sku: "SHOE-RED",
      quantity: 2,
      currency: "EUR",
      catalogLocale: "en",
    });

    expect(gateway.createCart).toHaveBeenCalledWith({
      currency: "EUR",
      country: undefined,
      anonymousId: "anon-1",
      lineItems: [{ sku: "SHOE-RED", quantity: 2 }],
    });
    expect(snapshot.id).toBe("cart-1");
    expect(gateway.updateCart).not.toHaveBeenCalled();
  });

  it("sends only sku to commercetools when productId is also provided", async () => {
    const created = createCart();
    const gateway = createGateway({
      createCart: vi.fn().mockResolvedValue(created),
    });
    const ops = createCartOperations(gateway);

    await ops.addToCart({
      anonymousId: "anon-1",
      sku: "SHOE-RED",
      productId: "p-1",
      variantId: 1,
      catalogLocale: "en",
    });

    expect(gateway.createCart).toHaveBeenCalledWith({
      currency: "EUR",
      country: undefined,
      anonymousId: "anon-1",
      lineItems: [{ sku: "SHOE-RED", quantity: 1 }],
    });
  });

  it("adds a line item to an existing cart", async () => {
    const existing = createCart();
    const updated = createCart({ version: 2 });
    const gateway = createGateway({
      queryCarts: vi.fn().mockResolvedValue([existing]),
      updateCart: vi.fn().mockResolvedValue(updated),
    });
    const ops = createCartOperations(gateway);

    const snapshot = await ops.addToCart({
      anonymousId: "anon-1",
      productId: "p-2",
      variantId: 1,
      catalogLocale: "en",
    });

    expect(gateway.updateCart).toHaveBeenCalledWith("cart-1", 1, [
      {
        action: "addLineItem",
        productId: "p-2",
        variantId: 1,
        quantity: 1,
      },
    ]);
    expect(snapshot.version).toBe(2);
  });

  it("sets country on an existing cart before adding a line item", async () => {
    const existing = createCart();
    const updated = createCart({ version: 2, country: "DE" });
    const gateway = createGateway({
      queryCarts: vi.fn().mockResolvedValue([existing]),
      updateCart: vi.fn().mockResolvedValue(updated),
    });
    const ops = createCartOperations(gateway);

    await ops.addToCart({
      anonymousId: "anon-1",
      sku: "SHOE-RED",
      country: "DE",
      catalogLocale: "en",
    });

    expect(gateway.updateCart).toHaveBeenCalledWith("cart-1", 1, [
      { action: "setCountry", country: "DE" },
      { action: "addLineItem", sku: "SHOE-RED", quantity: 1 },
    ]);
  });

  it("retries cart updates after a concurrent modification", async () => {
    const existing = createCart();
    const latest = createCart({ version: 4 });
    const updated = createCart({ version: 5 });
    const updateCart = vi
      .fn<(id: string, version: number, actions: CartUpdateAction[]) => Promise<Cart>>()
      .mockRejectedValueOnce({ statusCode: 409 })
      .mockResolvedValueOnce(updated);
    const gateway = createGateway({
      queryCarts: vi.fn().mockResolvedValue([existing]),
      getCartById: vi.fn().mockResolvedValue(latest),
      updateCart,
    });
    const ops = createCartOperations(gateway);

    const snapshot = await ops.removeLineItem({
      anonymousId: "anon-1",
      lineItemId: "li-1",
      catalogLocale: "en",
    });

    expect(updateCart).toHaveBeenNthCalledWith(1, "cart-1", 1, [
      { action: "removeLineItem", lineItemId: "li-1" },
    ]);
    expect(updateCart).toHaveBeenNthCalledWith(2, "cart-1", 4, [
      { action: "removeLineItem", lineItemId: "li-1" },
    ]);
    expect(snapshot.version).toBe(5);
  });

  it("throws CartNotFoundError when mutating without an active cart", async () => {
    const ops = createCartOperations(createGateway());

    await expect(
      ops.removeLineItem({
        anonymousId: "anon-1",
        lineItemId: "li-1",
      }),
    ).rejects.toBeInstanceOf(CartNotFoundError);
  });

  it("rejects cart mutations for a different anonymous session", async () => {
    const gateway = createGateway({
      getCartById: vi.fn().mockResolvedValue(createCart({ anonymousId: "other" })),
    });
    const ops = createCartOperations(gateway);

    await expect(
      ops.changeLineItemQuantity({
        anonymousId: "anon-1",
        cartId: "cart-1",
        lineItemId: "li-1",
        quantity: 3,
      }),
    ).rejects.toBeInstanceOf(CartAccessDeniedError);
  });

  it("adds to the cart identified by cartId instead of the latest anonymous cart", async () => {
    const targeted = createCart({ id: "cart-old" });
    const other = createCart({ id: "cart-new", version: 8 });
    const updated = createCart({ id: "cart-old", version: 2 });
    const gateway = createGateway({
      queryCarts: vi.fn().mockResolvedValue([other]),
      getCartById: vi.fn().mockResolvedValue(targeted),
      updateCart: vi.fn().mockResolvedValue(updated),
    });
    const ops = createCartOperations(gateway);

    const snapshot = await ops.addToCart({
      anonymousId: "anon-1",
      cartId: "cart-old",
      sku: "SHOE-RED",
      catalogLocale: "en",
    });

    expect(gateway.createCart).not.toHaveBeenCalled();
    expect(gateway.queryCarts).not.toHaveBeenCalled();
    expect(gateway.getCartById).toHaveBeenCalledWith("cart-old");
    expect(gateway.updateCart).toHaveBeenCalledWith("cart-old", 1, [
      { action: "addLineItem", sku: "SHOE-RED", quantity: 1 },
    ]);
    expect(snapshot.id).toBe("cart-old");
  });

  it("adds to the cart created by a concurrent request when create loses the race", async () => {
    const raced = createCart({ id: "cart-raced", version: 1 });
    const updated = createCart({ id: "cart-raced", version: 2 });
    const gateway = createGateway({
      queryCarts: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([raced]),
      createCart: vi.fn().mockRejectedValue(new Error("duplicate cart")),
      updateCart: vi.fn().mockResolvedValue(updated),
    });
    const ops = createCartOperations(gateway);

    const snapshot = await ops.addToCart({
      anonymousId: "anon-1",
      sku: "SHOE-RED",
      catalogLocale: "en",
    });

    expect(gateway.createCart).toHaveBeenCalledOnce();
    expect(gateway.updateCart).toHaveBeenCalledWith("cart-raced", 1, [
      { action: "addLineItem", sku: "SHOE-RED", quantity: 1 },
    ]);
    expect(snapshot.id).toBe("cart-raced");
  });

  it("rejects add-to-cart without sku or productId", async () => {
    const ops = createCartOperations(createGateway());

    await expect(ops.addToCart({ anonymousId: "anon-1" })).rejects.toThrow(
      "sku or productId is required",
    );
  });

  it("creates a customer cart when adding as an authenticated customer", async () => {
    const created = createCart({ anonymousId: undefined, customerId: "cust-1" });
    const gateway = createGateway({
      createCart: vi.fn().mockResolvedValue(created),
    });
    const ops = createCartOperations(gateway);

    const snapshot = await ops.addToCart({
      customerId: "cust-1",
      sku: "SHOE-RED",
      catalogLocale: "en",
    });

    expect(gateway.createCart).toHaveBeenCalledWith({
      currency: "EUR",
      country: undefined,
      anonymousId: undefined,
      customerId: "cust-1",
      lineItems: [{ sku: "SHOE-RED", quantity: 1 }],
    });
    expect(snapshot.customerId).toBe("cust-1");
    expect(gateway.queryCarts).toHaveBeenCalledWith(
      'customerId="cust-1" and cartState="Active"',
    );
  });

  it("rejects customer mutations against another customer's cart", async () => {
    const gateway = createGateway({
      getCartById: vi.fn().mockResolvedValue(createCart({ customerId: "other" })),
    });
    const ops = createCartOperations(gateway);

    await expect(
      ops.removeLineItem({
        customerId: "cust-1",
        cartId: "cart-1",
        lineItemId: "li-1",
      }),
    ).rejects.toBeInstanceOf(CartAccessDeniedError);
  });

  it("merges an anonymous cart on login when the customer has no cart", async () => {
    const anonymousCart = createCart({ id: "anon-cart" });
    const merged = createCart({
      id: "anon-cart",
      anonymousId: undefined,
      customerId: "cust-1",
    });
    const gateway = createGateway({
      queryCarts: vi.fn().mockResolvedValue([anonymousCart]),
      loginCustomer: vi.fn().mockResolvedValue({
        customer: { id: "cust-1", email: "ada@example.com" },
        cart: merged,
      }),
    });
    const ops = createCartOperations(gateway);

    const result = await ops.loginAndMerge({
      email: "ada@example.com",
      password: "secret",
      anonymousId: "anon-1",
      catalogLocale: "en",
    });

    expect(gateway.loginCustomer).toHaveBeenCalledWith({
      email: "ada@example.com",
      password: "secret",
      anonymousId: "anon-1",
      anonymousCartId: "anon-cart",
    });
    expect(result.customer).toEqual({ id: "cust-1", email: "ada@example.com" });
    expect(result.cart?.id).toBe("anon-cart");
    expect(result.cart?.customerId).toBe("cust-1");
  });

  it("merges a client cartId only when it belongs to the anonymous session", async () => {
    const owned = createCart({ id: "anon-cart", anonymousId: "anon-1" });
    const merged = createCart({ id: "anon-cart", customerId: "cust-1", anonymousId: undefined });
    const gateway = createGateway({
      getCartById: vi.fn().mockResolvedValue(owned),
      loginCustomer: vi.fn().mockResolvedValue({
        customer: { id: "cust-1", email: "ada@example.com" },
        cart: merged,
      }),
    });
    const ops = createCartOperations(gateway);

    const result = await ops.loginAndMerge({
      email: "ada@example.com",
      password: "secret",
      anonymousId: "anon-1",
      cartId: "anon-cart",
    });

    expect(gateway.getCartById).toHaveBeenCalledWith("anon-cart");
    expect(gateway.loginCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ anonymousCartId: "anon-cart", anonymousId: "anon-1" }),
    );
    expect(result.cart?.id).toBe("anon-cart");
  });

  it("rejects a client cartId that does not belong to the anonymous session", async () => {
    const gateway = createGateway({
      getCartById: vi.fn().mockResolvedValue(createCart({ id: "other-cart", anonymousId: "other-anon" })),
      loginCustomer: vi.fn(),
    });
    const ops = createCartOperations(gateway);

    await expect(
      ops.loginAndMerge({
        email: "ada@example.com",
        password: "secret",
        anonymousId: "anon-1",
        cartId: "other-cart",
      }),
    ).rejects.toBeInstanceOf(CartAccessDeniedError);
    expect(gateway.loginCustomer).not.toHaveBeenCalled();
  });

  it("rejects a client cartId when anonymousId is missing", async () => {
    const gateway = createGateway({
      loginCustomer: vi.fn(),
    });
    const ops = createCartOperations(gateway);

    await expect(
      ops.loginAndMerge({
        email: "ada@example.com",
        password: "secret",
        cartId: "anon-cart",
      }),
    ).rejects.toBeInstanceOf(CartAccessDeniedError);
    expect(gateway.loginCustomer).not.toHaveBeenCalled();
  });

  it("looks up the customer cart when login returns no cart", async () => {
    const customerCart = createCart({ id: "cust-cart", customerId: "cust-1" });
    const gateway = createGateway({
      loginCustomer: vi.fn().mockResolvedValue({
        customer: { id: "cust-1", email: "ada@example.com" },
      }),
      queryCarts: vi.fn().mockResolvedValue([customerCart]),
    });
    const ops = createCartOperations(gateway);

    const result = await ops.loginAndMerge({
      email: "ada@example.com",
      password: "secret",
    });

    expect(gateway.queryCarts).toHaveBeenCalledWith(
      'customerId="cust-1" and cartState="Active"',
    );
    expect(result.cart?.id).toBe("cust-cart");
  });

  it("throws InvalidCredentialsError when login fails with InvalidCredentials", async () => {
    const gateway = createGateway({
      loginCustomer: vi.fn().mockRejectedValue({
        statusCode: 400,
        body: { errors: [{ code: "InvalidCredentials" }] },
      }),
    });
    const ops = createCartOperations(gateway);

    await expect(
      ops.loginAndMerge({ email: "ada@example.com", password: "wrong" }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });
});
