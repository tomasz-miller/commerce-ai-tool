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
import { ValidationError } from "./errors.js";
import { InvalidCartSessionError, signCartSession } from "./cart-session.js";
import type { CommerceAIServer } from "./server.js";

const VALID_ORDER_NUMBER = "cat-3f2b8c1e-9d4a-4e6b-8a1c-2b7d9e0f1a3c";

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
        orderNumber: VALID_ORDER_NUMBER,
      }),
    ).resolves.toEqual({ order });
    expect(commerceServer.commercetools.createOrder).toHaveBeenCalledWith({
      anonymousId: "anon-1",
      customerId: undefined,
      cartId: undefined,
      catalogLocale: "en",
      orderNumber: VALID_ORDER_NUMBER,
    });
  });

  it("an invalid catalogLocale never turns a successful order into a 500", async () => {
    const commerceServer = server();

    await expect(
      executeCreateOrder(commerceServer, {
        anonymousId: "anon-1",
        orderNumber: VALID_ORDER_NUMBER,
        catalogLocale: "en_GB!!",
      }),
    ).resolves.toEqual({ order });
    expect(commerceServer.commercetools.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({ catalogLocale: "en" }),
    );
  });

  it("restricts checkout locales to the configured allowlist", async () => {
    const commerceServer = { ...server(), supportedLocales: ["en", "de-DE"] };

    await executeGetShippingMethods(commerceServer, {
      anonymousId: "anon-1",
      catalogLocale: "de-de",
    });
    await executeGetShippingMethods(commerceServer, {
      anonymousId: "anon-1",
      catalogLocale: "fr-FR",
    });

    const calls = vi.mocked(commerceServer.commercetools.getShippingMethods).mock.calls;
    expect(calls.map(([input]) => input.catalogLocale)).toEqual(["de-DE", "en"]);
  });

  it('rejects orderNumber \'x" or 1=1\'', async () => {
    const commerceServer = server();

    for (const orderNumber of ['x" or 1=1', "cat-1", `${VALID_ORDER_NUMBER}x`, "CAT-" + VALID_ORDER_NUMBER.slice(4)]) {
      await expect(
        executeCreateOrder(commerceServer, { anonymousId: "anon-1", orderNumber }),
      ).rejects.toMatchObject({ status: 400, code: "VALIDATION" });
    }
    expect(commerceServer.commercetools.createOrder).not.toHaveBeenCalled();
  });

  it("lets the core generate the order number when none is sent", async () => {
    const commerceServer = server();

    await executeCreateOrder(commerceServer, { anonymousId: "anon-1", orderNumber: "  " });

    expect(commerceServer.commercetools.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({ orderNumber: undefined }),
    );
  });

  it("rejects a shipping country outside cartPolicy.allowedCountries", async () => {
    const commerceServer = { ...server(), cartPolicy: { allowedCountries: ["AT"] } };

    await expect(
      executeSetCartAddresses(commerceServer, { anonymousId: "anon-1", shippingAddress: address }),
    ).rejects.toMatchObject({ status: 400, code: "VALIDATION" });
    expect(commerceServer.commercetools.setCartAddresses).not.toHaveBeenCalled();

    await executeSetCartAddresses(
      { ...server(), cartPolicy: { allowedCountries: ["DE"] } },
      { anonymousId: "anon-1", shippingAddress: address },
    );
  });

  it("passes the session customer and rejects a revoked session on every checkout step", async () => {
    const sessionToken = signCartSession({ customerId: "cust-1" }, "test-secret");
    const live = server();
    await executeCreateOrder(live, { sessionToken, orderNumber: VALID_ORDER_NUMBER });
    expect(live.commercetools.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: "cust-1" }),
    );

    const revoked = { ...server(), cartSessionHooks: { isRevoked: async () => true } };
    await expect(
      executeSetCartAddresses(revoked, { sessionToken, shippingAddress: address }),
    ).rejects.toBeInstanceOf(InvalidCartSessionError);
    await expect(executeGetShippingMethods(revoked, { sessionToken })).rejects.toBeInstanceOf(
      InvalidCartSessionError,
    );
    await expect(
      executeSetShippingMethod(revoked, { sessionToken, shippingMethodId: "shipping-1" }),
    ).rejects.toBeInstanceOf(InvalidCartSessionError);
    await expect(
      executeCreateOrder(revoked, { sessionToken, orderNumber: VALID_ORDER_NUMBER }),
    ).rejects.toBeInstanceOf(InvalidCartSessionError);
    expect(revoked.commercetools.createOrder).not.toHaveBeenCalled();
  });
});
