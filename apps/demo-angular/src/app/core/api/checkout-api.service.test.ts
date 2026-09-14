import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CartSessionStore, createMemoryStorage } from "./cart-session.store.js";
import { CheckoutApiService } from "./checkout-api.service.js";

const sampleCart = {
  id: "cart-1",
  version: 1,
  anonymousId: "anon-1",
  lineItems: [],
  totalPrice: { amount: 0, currency: "EUR", formatted: "€0.00" },
  totalQuantity: 0,
};

function createService(): CheckoutApiService {
  const sessions = new CartSessionStore();
  sessions.useBackend(createMemoryStorage({ "commerce-ai-tool:anonymousId": "anon-1" }));
  const service = new CheckoutApiService(sessions);
  service.configure({ apiBaseUrl: "/api/commerce-ai", currency: "EUR", country: "DE" });
  return service;
}

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 400, json: async () => body } as Response;
}

describe("CheckoutApiService", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ cart: sampleCart })));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads the cart on configure", async () => {
    const service = createService();
    await vi.waitFor(() => {
      expect(service.cart()).toEqual(sampleCart);
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/commerce-ai/cart?anonymousId=anon-1",
      expect.anything(),
    );
  });

  it("refetches the cart on later configure calls", async () => {
    const restocked = { ...sampleCart, version: 4, totalQuantity: 2 };
    const service = createService();
    await vi.waitFor(() => {
      expect(service.cart()).toEqual(sampleCart);
    });

    service.cart.set(null);
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ cart: restocked }));
    service.configure({ apiBaseUrl: "/api/commerce-ai", currency: "EUR", country: "DE" });

    await vi.waitFor(() => {
      expect(service.cart()).toEqual(restocked);
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("sends addresses through /cart/addresses", async () => {
    const updated = { ...sampleCart, version: 2 };
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ cart: sampleCart }))
      .mockResolvedValueOnce(jsonResponse({ cart: updated }));

    const service = createService();
    await vi.waitFor(() => {
      expect(service.cart()).toEqual(sampleCart);
    });

    const address = {
      firstName: "Ada",
      lastName: "Lovelace",
      streetName: "Main Street",
      postalCode: "10115",
      city: "Berlin",
      country: "DE",
    };
    const result = await service.setAddresses(address);
    expect(result).toEqual(updated);
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/commerce-ai/cart/addresses",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("Main Street"),
      }),
    );
  });

  it("lists shipping methods and selects one", async () => {
    const methods = [{ id: "ship-1", name: "Standard delivery" }];
    const withMethod = { ...sampleCart, shippingMethod: methods[0] };
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ cart: sampleCart }))
      .mockResolvedValueOnce(jsonResponse({ shippingMethods: methods }))
      .mockResolvedValueOnce(jsonResponse({ cart: withMethod }));

    const service = createService();
    await vi.waitFor(() => {
      expect(service.cart()).toEqual(sampleCart);
    });

    await expect(service.getShippingMethods()).resolves.toEqual(methods);
    const result = await service.setShippingMethod("ship-1");
    expect(result?.shippingMethod).toEqual(methods[0]);
  });

  it("authorizes a payment and places the order", async () => {
    const payment = {
      id: "pay-1",
      paymentInterface: "MOCK",
      method: "CREDIT_CARD",
      status: "authorized",
      amount: sampleCart.totalPrice,
    };
    const order = {
      id: "order-1",
      orderNumber: "cat-1",
      orderState: "Open",
      totalPrice: sampleCart.totalPrice,
      lineItems: [],
    };
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ cart: sampleCart }))
      .mockResolvedValueOnce(jsonResponse({ payment, cart: sampleCart }))
      .mockResolvedValueOnce(jsonResponse({ order }));

    const service = createService();
    await vi.waitFor(() => {
      expect(service.cart()).toEqual(sampleCart);
    });

    await expect(service.authorizePayment("CREDIT_CARD")).resolves.toEqual(payment);
    await expect(service.placeOrder()).resolves.toEqual(order);
    expect(service.cart()).toBeNull();
  });

  it("looks up a single order and lists recent orders", async () => {
    const order = {
      id: "order-1",
      orderNumber: "cat-1",
      orderState: "Open",
      totalPrice: sampleCart.totalPrice,
      lineItems: [],
    };
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ cart: sampleCart }));

    const service = createService();
    await vi.waitFor(() => {
      expect(service.cart()).toEqual(sampleCart);
    });

    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ order }));
    await expect(service.getOrder("cat-1")).resolves.toEqual(order);
    expect(fetch).toHaveBeenLastCalledWith(
      expect.stringContaining("/orders?"),
      expect.anything(),
    );

    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ orders: [order] }));
    await expect(service.listOrders()).resolves.toEqual([order]);
  });

  it("surfaces BFF errors without throwing", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ cart: sampleCart }));
    const service = createService();
    await vi.waitFor(() => {
      expect(service.cart()).toEqual(sampleCart);
    });

    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ error: "No shipping zone" }, false));
    await expect(service.getShippingMethods()).resolves.toBeNull();
    expect(service.error()).toBe("No shipping zone");
  });
});
