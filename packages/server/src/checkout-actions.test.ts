import type {
  CartSnapshot,
  CommercetoolsClient,
  OrderSnapshot,
  SearchOrchestrator,
} from "@commerce-ai-tool/core";
import { describe, expect, it, vi } from "vitest";
import {
  executeCreateOrder,
  executeGetShippingMethods,
  executeSetCartAddresses,
  executeSetShippingMethod,
} from "./checkout-actions.js";
import { ValidationError } from "./route-actions.js";
import type { CommerceAIServer } from "./server.js";

const cart: CartSnapshot = {
  id: "cart-1",
  version: 1,
  anonymousId: "anon-1",
  lineItems: [],
  totalPrice: { amount: 0, currency: "EUR", formatted: "€0.00" },
  totalQuantity: 0,
};

const order: OrderSnapshot = {
  id: "order-1",
  orderNumber: "cat-1",
  orderState: "Open",
  totalPrice: cart.totalPrice,
  lineItems: [],
};

function server(): CommerceAIServer {
  return {
    orchestrator: {} as SearchOrchestrator,
    commercetools: {
      setCartAddresses: vi.fn().mockResolvedValue(cart),
      getShippingMethods: vi.fn().mockResolvedValue([
        { id: "shipping-1", name: "Standard delivery" },
      ]),
      setShippingMethod: vi.fn().mockResolvedValue(cart),
      createOrder: vi.fn().mockResolvedValue(order),
    } as unknown as CommercetoolsClient,
    cartDefaults: { currency: "EUR", country: "DE", catalogLocale: "en" },
    cartSessionSecret: "test-secret",
    transcribeAudio: vi.fn(),
    synthesizeSpeech: vi.fn(),
  };
}

const address = {
  firstName: "Ada",
  lastName: "Lovelace",
  streetName: "Main Street",
  postalCode: "10115",
  city: "Berlin",
  country: "de",
};

describe("checkout-actions", () => {
  it("validates and normalizes checkout addresses", async () => {
    const commerceServer = server();

    await executeSetCartAddresses(commerceServer, {
      anonymousId: "anon-1",
      shippingAddress: address,
    });

    expect(commerceServer.commercetools.setCartAddresses).toHaveBeenCalledWith({
      anonymousId: "anon-1",
      customerId: undefined,
      cartId: undefined,
      catalogLocale: "en",
      shippingAddress: { ...address, country: "DE" },
      billingAddress: undefined,
    });
  });

  it("rejects invalid country codes", async () => {
    await expect(
      executeSetCartAddresses(server(), {
        anonymousId: "anon-1",
        shippingAddress: { ...address, country: "Germany" },
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("loads and selects shipping methods", async () => {
    const commerceServer = server();

    await expect(
      executeGetShippingMethods(commerceServer, { anonymousId: "anon-1" }),
    ).resolves.toEqual({
      shippingMethods: [{ id: "shipping-1", name: "Standard delivery" }],
    });
    await executeSetShippingMethod(commerceServer, {
      anonymousId: "anon-1",
      shippingMethodId: "shipping-1",
    });
    expect(commerceServer.commercetools.setShippingMethod).toHaveBeenCalledWith({
      anonymousId: "anon-1",
      customerId: undefined,
      cartId: undefined,
      catalogLocale: "en",
      shippingMethodId: "shipping-1",
    });
  });

  it("creates an order with a stable client order number", async () => {
    const commerceServer = server();

    await expect(
      executeCreateOrder(commerceServer, {
        anonymousId: "anon-1",
        orderNumber: "cat-request-1",
      }),
    ).resolves.toEqual({ order });
    expect(commerceServer.commercetools.createOrder).toHaveBeenCalledWith({
      anonymousId: "anon-1",
      customerId: undefined,
      cartId: undefined,
      catalogLocale: "en",
      orderNumber: "cat-request-1",
    });
  });
});
