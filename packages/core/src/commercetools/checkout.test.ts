import { describe, expect, it, vi } from "vitest";
import type {
  Cart,
  Order,
  ShippingMethod,
} from "@commercetools/platform-sdk";
import {
  CheckoutIncompleteError,
  createCheckoutOperations,
  type CheckoutGateway,
} from "./checkout.js";

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
    updateOrder: vi.fn().mockImplementation(async (_id, version, actions) => ({
      ...order(),
      version: version + 1,
      paymentState: actions[0] && "paymentState" in actions[0] ? actions[0].paymentState : undefined,
    })),
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

describe("createCheckoutOperations", () => {
  it("sets shipping and matching billing addresses", async () => {
    const api = gateway();
    const checkout = createCheckoutOperations(api);

    await checkout.setCartAddresses({ anonymousId: "anon-1", shippingAddress: address });

    expect(api.updateCart).toHaveBeenCalledWith("cart-1", 2, [
      { action: "setShippingAddress", address },
      { action: "setBillingAddress", address },
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

  it("rejects order creation without a shipping address", async () => {
    const checkout = createCheckoutOperations(gateway());

    await expect(checkout.createOrder({ anonymousId: "anon-1" })).rejects.toEqual(
      new CheckoutIncompleteError("Shipping address is required"),
    );
  });

  it("rejects order creation when payment is required but missing", async () => {
    const readyCart = cart({
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

  it("sets order paymentState after a successful authorization", async () => {
    const readyCart = cart({
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
    expect(api.updateOrder).toHaveBeenCalledWith("order-1", 2, [
      { action: "changePaymentState", paymentState: "Pending" },
    ]);
  });

  it("rejects order creation when the authorized amount does not match the cart total", async () => {
    const readyCart = cart({
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

  it("still returns paymentState when changePaymentState fails", async () => {
    const readyCart = cart({
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
      queryCarts: vi.fn().mockResolvedValue([readyCart]),
      getPaymentById: vi.fn().mockResolvedValue({
        id: "pay-1",
        transactions: [{ type: "Authorization", state: "Success", amount: money(9900) }],
        amountPlanned: money(9900),
        paymentMethodInfo: { paymentInterface: "MOCK", method: "CREDIT_CARD" },
      }),
      updateOrder: vi.fn().mockRejectedValue(new Error("version conflict")),
    });
    const checkout = createCheckoutOperations(api, { requirePayment: true });

    await expect(
      checkout.createOrder({ anonymousId: "anon-1", orderNumber: "cat-request-1" }),
    ).resolves.toMatchObject({ paymentState: "Pending" });
  });
});
