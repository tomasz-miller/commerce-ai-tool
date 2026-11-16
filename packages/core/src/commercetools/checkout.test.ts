import { describe, expect, it, vi } from "vitest";
import type {
  Cart,
  Order,
  ShippingMethod,
} from "@commercetools/platform-sdk";
import {
  CheckoutIncompleteError,
  CountryNotAllowedError,
  CurrencyMismatchError,
  createCheckoutOperations,
  createCheckoutOrderNumber,
  type CheckoutGateway,
  type CheckoutOperationsOptions,
} from "./checkout.js";
import {
  ORDER_NUMBER_PATTERN,
} from "../config/defaults.js";

function money(centAmount: number) {
  return {
    type: "centPrecision" as const,
    centAmount,
    currencyCode: "EUR",
    fractionDigits: 2,
  };
}

function cart(overrides: Partial<Cart> = {}): Cart {
  return {
    id: "cart-1",
    version: 2,
    createdAt: "2026-01-01T00:00:00.000Z",
    lastModifiedAt: "2026-01-01T00:00:00.000Z",
    lineItems: [
      {
        id: "line-1",
        productId: "product-1",
        name: { en: "Running shoe" },
        productType: { typeId: "product-type", id: "type-1" },
        variant: { id: 1, sku: "RUN-1" },
        price: { id: "price-1", value: money(9900) },
        quantity: 1,
        totalPrice: money(9900),
      },
    ],
    customLineItems: [],
    totalPrice: money(9900),
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
    anonymousId: "anon-1",
    ...overrides,
  } as Cart;
}

function shippingMethod(): ShippingMethod {
  return {
    id: "shipping-1",
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    lastModifiedAt: "2026-01-01T00:00:00.000Z",
    name: "Standard delivery",
    description: "Delivery in 3–5 days",
    active: true,
    isDefault: false,
    taxCategory: undefined,
    zoneRates: [],
  } as unknown as ShippingMethod;
}

function order(): Order {
  return {
    ...cart({
      id: "order-1",
      cartState: "Ordered",
      shippingAddress: {
        firstName: "Ada",
        lastName: "Lovelace",
        streetName: "Main Street",
        postalCode: "10115",
        city: "Berlin",
        country: "DE",
      },
    }),
    orderNumber: "cat-test",
    orderState: "Open",
    syncInfo: [],
    returnInfo: [],
    shipmentState: undefined,
    paymentState: undefined,
    cart: { typeId: "cart", id: "cart-1" },
  } as unknown as Order;
}

function gateway(overrides: Partial<CheckoutGateway> = {}): CheckoutGateway {
  return {
    queryCarts: vi.fn().mockResolvedValue([cart()]),
    getCartById: vi.fn().mockResolvedValue(cart()),
    updateCart: vi.fn().mockResolvedValue(cart({ version: 3 })),
    getShippingMethodsMatchingCart: vi.fn().mockResolvedValue([shippingMethod()]),
    createOrderFromCart: vi.fn().mockResolvedValue(order()),
    getPaymentById: vi.fn(),
    ...overrides,
  };
}

const address = {
  firstName: "Ada",
  lastName: "Lovelace",
  streetName: "Main Street",
  postalCode: "10115",
  city: "Berlin",
  country: "DE",
};

function readyCartWithPayment() {
  return cart({
    country: "DE",
    shippingAddress: address,
    shippingInfo: {
      shippingMethodName: "Standard delivery",
      price: money(500),
      shippingRate: { price: money(500), tiers: [] },
      taxRate: undefined,
      taxedPrice: undefined,
      deliveries: [],
      discountedPrice: undefined,
      shippingMethod: { typeId: "shipping-method", id: "shipping-1" },
      shippingMethodState: "MatchesCart",
    },
    paymentInfo: { payments: [{ typeId: "payment", id: "pay-1" }] },
  });
}

describe("createCheckoutOrderNumber", () => {
  it("matches ORDER_NUMBER_PATTERN", () => {
    expect(createCheckoutOrderNumber()).toMatch(ORDER_NUMBER_PATTERN);
    expect(ORDER_NUMBER_PATTERN.test('x" or 1=1')).toBe(false);
    // Strict UUID layout: 36 hex-or-dash characters in any order are not enough.
    expect(ORDER_NUMBER_PATTERN.test(`cat-${"-".repeat(36)}`)).toBe(false);
    expect(ORDER_NUMBER_PATTERN.test(`cat-${"a".repeat(36)}`)).toBe(false);
  });
});

describe("createCheckoutOperations", () => {
  it("sets shipping and matching billing addresses", async () => {
    const api = gateway({ queryCarts: vi.fn().mockResolvedValue([cart({ country: "DE" })]) });
    const checkout = createCheckoutOperations(api);

    await checkout.setCartAddresses({ anonymousId: "anon-1", shippingAddress: address });

    expect(api.updateCart).toHaveBeenCalledWith("cart-1", 2, [
      { action: "setShippingAddress", address },
      { action: "setBillingAddress", address },
    ]);
  });

  it("setCartAddresses sets cart country to the shipping country", async () => {
    const api = gateway({ queryCarts: vi.fn().mockResolvedValue([cart({ country: "PL" })]) });
    const checkout = createCheckoutOperations(api);

    await checkout.setCartAddresses({ anonymousId: "anon-1", shippingAddress: address });

    expect(api.updateCart).toHaveBeenCalledWith("cart-1", 2, [
      { action: "setShippingAddress", address },
      { action: "setBillingAddress", address },
      { action: "setCountry", country: "DE" },
    ]);
  });

  it("setCartAddresses rejects a shipping country outside allowedCountries", async () => {
    const api = gateway();
    const checkout = createCheckoutOperations(api, { allowedCountries: ["AT"] });

    await expect(
      checkout.setCartAddresses({ anonymousId: "anon-1", shippingAddress: address }),
    ).rejects.toBeInstanceOf(CountryNotAllowedError);
    expect(api.updateCart).not.toHaveBeenCalled();
  });

  it("setCartAddresses rejects a shipping country whose policy currency differs from the cart currency", async () => {
    const api = gateway({ queryCarts: vi.fn().mockResolvedValue([cart({ country: "DE" })]) });
    const checkout = createCheckoutOperations(api, {
      allowedCountries: ["DE", "CH"],
      currencyByCountry: { DE: "EUR", CH: "CHF" },
    });

    await expect(
      checkout.setCartAddresses({
        anonymousId: "anon-1",
        shippingAddress: { ...address, country: "CH" },
      }),
    ).rejects.toBeInstanceOf(CurrencyMismatchError);
    expect(api.updateCart).not.toHaveBeenCalled();

    await checkout.setCartAddresses({ anonymousId: "anon-1", shippingAddress: address });
    expect(api.updateCart).toHaveBeenCalledTimes(1);
  });

  it("no policy → no currency check", async () => {
    const api = gateway({ queryCarts: vi.fn().mockResolvedValue([cart({ country: "DE" })]) });
    const checkout = createCheckoutOperations(api);
    const swiss = { ...address, country: "CH" };

    await checkout.setCartAddresses({ anonymousId: "anon-1", shippingAddress: swiss });

    expect(api.updateCart).toHaveBeenCalledWith("cart-1", 2, [
      { action: "setShippingAddress", address: swiss },
      { action: "setBillingAddress", address: swiss },
      { action: "setCountry", country: "CH" },
    ]);
  });

  it("returns client-safe matching shipping methods", async () => {
    const checkout = createCheckoutOperations(gateway());

    await expect(checkout.getShippingMethods({ anonymousId: "anon-1" })).resolves.toEqual([
      {
        id: "shipping-1",
        name: "Standard delivery",
        description: "Delivery in 3–5 days",
      },
    ]);
  });

  it("sets a selected shipping method", async () => {
    const api = gateway();
    const checkout = createCheckoutOperations(api);

    await checkout.setShippingMethod({
      anonymousId: "anon-1",
      shippingMethodId: "shipping-1",
    });

    expect(api.updateCart).toHaveBeenCalledWith("cart-1", 2, [
      {
        action: "setShippingMethod",
        shippingMethod: { typeId: "shipping-method", id: "shipping-1" },
      },
    ]);
  });

  it("creates an order after checkout prerequisites are met", async () => {
    const readyCart = cart({
      country: "DE",
      shippingAddress: address,
      shippingInfo: {
        shippingMethodName: "Standard delivery",
        price: money(500),
        shippingRate: { price: money(500), tiers: [] },
        taxRate: undefined,
        taxedPrice: undefined,
        deliveries: [],
        discountedPrice: undefined,
        shippingMethod: { typeId: "shipping-method", id: "shipping-1" },
        shippingMethodState: "MatchesCart",
      },
    });
    const api = gateway({ queryCarts: vi.fn().mockResolvedValue([readyCart]) });
    const checkout = createCheckoutOperations(api);

    await expect(
      checkout.createOrder({ anonymousId: "anon-1", orderNumber: "cat-request-1" }),
    ).resolves.toMatchObject({
      id: "order-1",
      orderNumber: "cat-test",
      orderState: "Open",
    });
    expect(api.createOrderFromCart).toHaveBeenCalledWith({
      cartId: "cart-1",
      version: 2,
      orderNumber: "cat-request-1",
    });
  });

  it("createOrder sets the cart country to the shipping country before ordering", async () => {
    const shippingInfo = {
      shippingMethodName: "Standard delivery",
      price: money(500),
      shippingRate: { price: money(500), tiers: [] },
      deliveries: [],
      shippingMethod: { typeId: "shipping-method", id: "shipping-1" },
      shippingMethodState: "MatchesCart",
    } as unknown as Cart["shippingInfo"];
    const staleCart = cart({ country: "PL", shippingAddress: address, shippingInfo });
    const reconciled = cart({ version: 3, country: "DE", shippingAddress: address, shippingInfo });
    const api = gateway({
      queryCarts: vi.fn().mockResolvedValue([staleCart]),
      updateCart: vi.fn().mockResolvedValue(reconciled),
    });
    const checkout = createCheckoutOperations(api);

    await checkout.createOrder({ anonymousId: "anon-1", orderNumber: "cat-request-1" });

    expect(api.updateCart).toHaveBeenCalledWith("cart-1", 2, [
      { action: "setCountry", country: "DE" },
    ]);
    expect(api.createOrderFromCart).toHaveBeenCalledWith({
      cartId: "cart-1",
      version: 3,
      orderNumber: "cat-request-1",
    });
  });

  it("createOrder rejects a shipping country outside allowedCountries", async () => {
    const api = gateway({
      queryCarts: vi.fn().mockResolvedValue([cart({ country: "DE", shippingAddress: address })]),
    });
    const checkout = createCheckoutOperations(api, { allowedCountries: ["AT"] });

    await expect(checkout.createOrder({ anonymousId: "anon-1" })).rejects.toBeInstanceOf(
      CountryNotAllowedError,
    );
    expect(api.createOrderFromCart).not.toHaveBeenCalled();
  });

  it("createOrder rejects a currency mismatch", async () => {
    const swiss = { ...address, country: "CH" };
    const api = gateway({
      queryCarts: vi.fn().mockResolvedValue([cart({ country: "CH", shippingAddress: swiss })]),
    });
    const checkout = createCheckoutOperations(api, { currencyByCountry: { CH: "CHF" } });

    await expect(checkout.createOrder({ anonymousId: "anon-1" })).rejects.toBeInstanceOf(
      CurrencyMismatchError,
    );
    expect(api.updateCart).not.toHaveBeenCalled();
    expect(api.createOrderFromCart).not.toHaveBeenCalled();
  });

  describe("retry-safe price scope", () => {
    const conflict = { statusCode: 409, body: { errors: [{ code: "ConcurrentModification" }] } };
    const shippingInfo = {
      shippingMethodName: "Standard delivery",
      price: money(500),
      shippingRate: { price: money(500), tiers: [] },
      deliveries: [],
      shippingMethod: { typeId: "shipping-method", id: "shipping-1" },
      shippingMethodState: "MatchesCart",
    } as unknown as Cart["shippingInfo"];

    it("a 409 during reconcile re-validates against the latest shipping country", async () => {
      const stale = cart({ country: "PL", shippingAddress: address, shippingInfo });
      const swiss = { ...address, country: "CH" };
      const latest = cart({ version: 3, country: "PL", shippingAddress: swiss, shippingInfo });

      const cases: [CheckoutOperationsOptions, new () => Error][] = [
        [{ allowedCountries: ["DE"] }, CountryNotAllowedError],
        [{ currencyByCountry: { DE: "EUR", CH: "CHF" } }, CurrencyMismatchError],
      ];
      for (const [options, error] of cases) {
        const api = gateway({
          queryCarts: vi.fn().mockResolvedValue([stale]),
          getCartById: vi.fn().mockResolvedValue(latest),
          updateCart: vi.fn().mockRejectedValueOnce(conflict),
        });
        const checkout = createCheckoutOperations(api, options);

        await expect(checkout.createOrder({ anonymousId: "anon-1" })).rejects.toBeInstanceOf(error);
        // The stale setCountry(DE) is never re-applied to the latest version.
        expect(api.updateCart).toHaveBeenCalledTimes(1);
        expect(api.createOrderFromCart).not.toHaveBeenCalled();
      }
    });

    it("a 409 during reconcile applies setCountry for the latest shipping country", async () => {
      const austria = { ...address, country: "AT" };
      const stale = cart({ country: "PL", shippingAddress: address, shippingInfo });
      const latest = cart({ version: 3, country: "PL", shippingAddress: austria, shippingInfo });
      const reconciled = cart({ version: 4, country: "AT", shippingAddress: austria, shippingInfo });
      const api = gateway({
        queryCarts: vi.fn().mockResolvedValue([stale]),
        getCartById: vi.fn().mockResolvedValue(latest),
        updateCart: vi.fn().mockRejectedValueOnce(conflict).mockResolvedValueOnce(reconciled),
      });
      const checkout = createCheckoutOperations(api, { allowedCountries: ["DE", "AT"] });

      await checkout.createOrder({ anonymousId: "anon-1", orderNumber: "cat-request-1" });

      expect(vi.mocked(api.updateCart).mock.calls).toEqual([
        ["cart-1", 2, [{ action: "setCountry", country: "DE" }]],
        ["cart-1", 3, [{ action: "setCountry", country: "AT" }]],
      ]);
      expect(api.createOrderFromCart).toHaveBeenCalledWith(
        expect.objectContaining({ version: 4 }),
      );
    });

    it("setCartAddresses rebuilds its actions from the latest cart after a 409", async () => {
      const stale = cart({ country: "DE" });
      const latest = cart({ version: 3, country: "PL" });
      const api = gateway({
        queryCarts: vi.fn().mockResolvedValue([stale]),
        getCartById: vi.fn().mockResolvedValue(latest),
        updateCart: vi.fn().mockRejectedValueOnce(conflict).mockResolvedValue(cart({ version: 4 })),
      });
      const checkout = createCheckoutOperations(api);

      await checkout.setCartAddresses({ anonymousId: "anon-1", shippingAddress: address });

      expect(vi.mocked(api.updateCart).mock.calls[1]).toEqual([
        "cart-1",
        3,
        [
          { action: "setShippingAddress", address },
          { action: "setBillingAddress", address },
          { action: "setCountry", country: "DE" },
        ],
      ]);
    });

    it("createOrder refuses when cart.country differs from the shipping country on the final version", async () => {
      const stale = cart({ country: "PL", shippingAddress: address, shippingInfo });
      // commercetools answers the setCountry with a version that still carries another country.
      const drifted = cart({ version: 3, country: "PL", shippingAddress: address, shippingInfo });
      const api = gateway({
        queryCarts: vi.fn().mockResolvedValue([stale]),
        updateCart: vi.fn().mockResolvedValue(drifted),
      });
      const checkout = createCheckoutOperations(api);

      await expect(checkout.createOrder({ anonymousId: "anon-1" })).rejects.toBeInstanceOf(
        CheckoutIncompleteError,
      );
      expect(api.createOrderFromCart).not.toHaveBeenCalled();
    });
  });

  it("rejects order creation without a shipping address", async () => {
    const checkout = createCheckoutOperations(gateway());

    await expect(checkout.createOrder({ anonymousId: "anon-1" })).rejects.toEqual(
      new CheckoutIncompleteError("Shipping address is required"),
    );
  });

  it("rejects order creation when payment is required but missing", async () => {
    const readyCart = cart({
      country: "DE",
      shippingAddress: address,
      shippingInfo: {
        shippingMethodName: "Standard delivery",
        price: money(500),
        shippingRate: { price: money(500), tiers: [] },
        taxRate: undefined,
        taxedPrice: undefined,
        deliveries: [],
        discountedPrice: undefined,
        shippingMethod: { typeId: "shipping-method", id: "shipping-1" },
        shippingMethodState: "MatchesCart",
      },
    });
    const checkout = createCheckoutOperations(
      gateway({ queryCarts: vi.fn().mockResolvedValue([readyCart]) }),
      { requirePayment: true },
    );

    await expect(checkout.createOrder({ anonymousId: "anon-1" })).rejects.toEqual(
      new CheckoutIncompleteError("Payment is required"),
    );
  });

  it("order is created with paymentState in the draft, no follow-up update", async () => {
    const readyCart = cart({
      country: "DE",
      shippingAddress: address,
      shippingInfo: {
        shippingMethodName: "Standard delivery",
        price: money(500),
        shippingRate: { price: money(500), tiers: [] },
        taxRate: undefined,
        taxedPrice: undefined,
        deliveries: [],
        discountedPrice: undefined,
        shippingMethod: { typeId: "shipping-method", id: "shipping-1" },
        shippingMethodState: "MatchesCart",
      },
      paymentInfo: {
        payments: [{ typeId: "payment", id: "pay-1" }],
      },
    });
    const api = gateway({
      createOrderFromCart: vi
        .fn()
        .mockResolvedValue({ ...order(), paymentState: "Pending" } as Order),
      queryCarts: vi.fn().mockResolvedValue([readyCart]),
      getPaymentById: vi.fn().mockResolvedValue({
        id: "pay-1",
        transactions: [{ type: "Authorization", state: "Success", amount: money(9900) }],
        amountPlanned: money(9900),
        paymentMethodInfo: { paymentInterface: "MOCK", method: "CREDIT_CARD" },
      }),
    });
    const checkout = createCheckoutOperations(api, { requirePayment: true });

    await expect(
      checkout.createOrder({ anonymousId: "anon-1", orderNumber: "cat-request-1" }),
    ).resolves.toMatchObject({ paymentState: "Pending" });
    expect(api.createOrderFromCart).toHaveBeenCalledWith({
      cartId: "cart-1",
      version: readyCart.version,
      orderNumber: "cat-request-1",
      paymentState: "Pending",
    });
    expect(api.getPaymentById).toHaveBeenCalledTimes(1);
  });

  it("rejects order creation when the authorized amount does not match the cart total", async () => {
    const readyCart = cart({
      country: "DE",
      shippingAddress: address,
      shippingInfo: {
        shippingMethodName: "Standard delivery",
        price: money(500),
        shippingRate: { price: money(500), tiers: [] },
        taxRate: undefined,
        taxedPrice: undefined,
        deliveries: [],
        discountedPrice: undefined,
        shippingMethod: { typeId: "shipping-method", id: "shipping-1" },
        shippingMethodState: "MatchesCart",
      },
      paymentInfo: {
        payments: [{ typeId: "payment", id: "pay-1" }],
      },
    });
    const checkout = createCheckoutOperations(
      gateway({
        queryCarts: vi.fn().mockResolvedValue([readyCart]),
        getPaymentById: vi.fn().mockResolvedValue({
          id: "pay-1",
          transactions: [{ type: "Authorization", state: "Success", amount: money(5000) }],
          amountPlanned: money(5000),
          paymentMethodInfo: { paymentInterface: "MOCK", method: "CREDIT_CARD" },
        }),
      }),
      { requirePayment: true },
    );

    await expect(checkout.createOrder({ anonymousId: "anon-1" })).rejects.toEqual(
      new CheckoutIncompleteError("Payment does not match the cart total"),
    );
  });

  it("omits paymentState from the order draft when there is no successful payment", async () => {
    const api = gateway({
      queryCarts: vi
        .fn()
        .mockResolvedValue([{ ...readyCartWithPayment(), paymentInfo: undefined }]),
    });
    const checkout = createCheckoutOperations(api);

    await checkout.createOrder({ anonymousId: "anon-1", orderNumber: "cat-request-1" });

    const draft = vi.mocked(api.createOrderFromCart).mock.calls[0]?.[0];
    expect(draft).toEqual({ cartId: "cart-1", version: 2, orderNumber: "cat-request-1" });
    expect(draft).not.toHaveProperty("paymentState");
  });

  it("does not create the order when fetching the payment fails", async () => {
    const api = gateway({
      queryCarts: vi.fn().mockResolvedValue([readyCartWithPayment()]),
      getPaymentById: vi.fn().mockRejectedValue(new Error("payment unavailable")),
    });
    const checkout = createCheckoutOperations(api);

    await expect(
      checkout.createOrder({ anonymousId: "anon-1", orderNumber: "cat-request-1" }),
    ).rejects.toThrow("payment unavailable");
    expect(api.createOrderFromCart).not.toHaveBeenCalled();
  });

  it("sends Paid when the payment has a successful charge", async () => {
    const api = gateway({
      queryCarts: vi.fn().mockResolvedValue([readyCartWithPayment()]),
      getPaymentById: vi.fn().mockResolvedValue({
        id: "pay-1",
        transactions: [{ type: "Charge", state: "Success", amount: money(9900) }],
        amountPlanned: money(9900),
        paymentMethodInfo: { paymentInterface: "MOCK", method: "CREDIT_CARD" },
      }),
    });
    const checkout = createCheckoutOperations(api, { requirePayment: true });

    await checkout.createOrder({ anonymousId: "anon-1", orderNumber: "cat-request-1" });

    expect(api.createOrderFromCart).toHaveBeenCalledWith(
      expect.objectContaining({ paymentState: "Paid" }),
    );
    expect(api.getPaymentById).toHaveBeenCalledTimes(1);
  });
});
