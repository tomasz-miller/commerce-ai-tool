import { describe, expect, it, vi } from "vitest";
import { signal } from "@angular/core";
import type { CartSnapshot } from "@commerce-ai-tool/core/client";
import { CheckoutApiService } from "../api/checkout-api.service.js";
import { CheckoutFacade } from "./checkout.facade.js";

const cart = {
  id: "cart-1",
  version: 2,
  lineItems: [],
  totalPrice: { amount: 99, currency: "EUR", formatted: "€99.00" },
  totalQuantity: 1,
  shippingMethod: { id: "ship-1", name: "Standard delivery" },
} as unknown as CartSnapshot;

const address = {
  firstName: "Ada",
  lastName: "Lovelace",
  streetName: "Main Street",
  postalCode: "10115",
  city: "Berlin",
  country: "DE",
};

function createFacade(overrides: Partial<CheckoutApiService> = {}): {
  facade: CheckoutFacade;
  api: CheckoutApiService;
} {
  const api = {
    cart: signal<CartSnapshot | null>(cart),
    setAddresses: vi.fn().mockResolvedValue(cart),
    getShippingMethods: vi.fn().mockResolvedValue([{ id: "ship-1", name: "Standard delivery" }]),
    getPaymentMethods: vi.fn().mockResolvedValue([]),
    setShippingMethod: vi.fn().mockResolvedValue(cart),
    authorizePayment: vi.fn(),
    placeOrder: vi.fn(),
  } as unknown as CheckoutApiService;
  Object.assign(api, overrides);
  return { facade: new CheckoutFacade(api), api };
}

describe("CheckoutFacade", () => {
  it("saves addresses and advances to delivery", async () => {
    const { facade, api } = createFacade();
    await expect(facade.saveAddresses(address)).resolves.toBe(true);

    expect(api.setAddresses).toHaveBeenCalledWith(address, undefined);
    expect(facade.addressesSaved()).toBe(true);
    expect(facade.shippingMethods()).toHaveLength(1);
    expect(facade.selectedShippingMethodId()).toBe("ship-1");
    expect(facade.shippingReady()).toBe(true);
    expect(facade.paymentRequired()).toBe(false);
    expect(facade.canPlaceOrder()).toBe(true);
  });

  it("stays on the address step when the BFF rejects the payload", async () => {
    const { facade } = createFacade({
      setAddresses: vi.fn().mockResolvedValue(null),
    } as Partial<CheckoutApiService> as CheckoutApiService);
    await expect(facade.saveAddresses(address)).resolves.toBe(false);
    expect(facade.addressesSaved()).toBe(false);
    expect(facade.canPlaceOrder()).toBe(false);
  });

  it("resets the payment selection when the shipping method changes", async () => {
    const { facade } = createFacade();
    await facade.saveAddresses(address);
    await expect(facade.selectShippingMethod("ship-1")).resolves.toBe(true);
    expect(facade.selectedShippingMethodId()).toBe("ship-1");
    expect(facade.authorizedPayment()).toBeNull();
  });

  it("skips re-authorization when the payment already covers the cart total", async () => {
    const payment = {
      id: "pay-1",
      paymentInterface: "MOCK",
      method: "CREDIT_CARD",
      status: "authorized",
      amount: { amount: 99, currency: "EUR", formatted: "€99.00" },
    } as const;
    const { facade, api } = createFacade();
    (api.getPaymentMethods as ReturnType<typeof vi.fn>).mockResolvedValue([
      { method: "CREDIT_CARD", name: "Credit card" },
    ]);
    (api.authorizePayment as ReturnType<typeof vi.fn>).mockResolvedValue(payment);

    await facade.saveAddresses(address);
    await expect(facade.selectPaymentMethod("CREDIT_CARD")).resolves.toBe(true);
    expect(facade.paymentReady()).toBe(true);
    expect(facade.canPlaceOrder()).toBe(true);

    vi.mocked(api.authorizePayment).mockClear();
    await expect(facade.selectPaymentMethod("CREDIT_CARD")).resolves.toBe(true);
    expect(api.authorizePayment).not.toHaveBeenCalled();
  });

  it("stores the placed order", async () => {
    const placedOrder = { id: "order-1", orderNumber: "cat-1" };
    const { facade } = createFacade({
      placeOrder: vi.fn().mockResolvedValue(placedOrder),
    } as Partial<CheckoutApiService> as CheckoutApiService);
    await expect(facade.placeOrder()).resolves.toEqual(placedOrder);
    expect(facade.order()).toEqual(placedOrder);
  });
});
