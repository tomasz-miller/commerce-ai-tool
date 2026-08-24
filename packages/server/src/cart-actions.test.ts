import type { CartSnapshot, CommercetoolsClient, SearchOrchestrator } from "@commerce-ai-tool/core";
import { describe, expect, it, vi } from "vitest";
import {
  executeAddToCart,
  executeGetCart,
  executeLogin,
  executeLogout,
  executeRemoveFromCart,
  executeUpdateCartQuantity,
} from "./cart-actions.js";
import { ValidationError } from "./route-actions.js";
import { InvalidCartSessionError, signCartSession } from "./cart-session.js";
import type { CommerceAIServer } from "./server.js";

const sampleCart: CartSnapshot = {
  id: "cart-1",
  version: 1,
  anonymousId: "anon-1",
  lineItems: [],
  totalPrice: { amount: 0, currency: "EUR", formatted: "€0.00" },
  totalQuantity: 0,
};

function createServer(): CommerceAIServer {
  return {
    orchestrator: {} as SearchOrchestrator,
    commercetools: {
      getCart: vi.fn().mockResolvedValue(sampleCart),
      getCustomerCart: vi.fn().mockResolvedValue(sampleCart),
      addToCart: vi.fn().mockResolvedValue(sampleCart),
      removeLineItem: vi.fn().mockResolvedValue(sampleCart),
      changeLineItemQuantity: vi.fn().mockResolvedValue(sampleCart),
      loginAndMerge: vi.fn(),
    } as unknown as CommercetoolsClient,
    cartDefaults: { currency: "EUR", country: "DE", catalogLocale: "en" },
    cartSessionSecret: "test-secret",
    transcribeAudio: vi.fn(),
    synthesizeSpeech: vi.fn(),
  };
}

describe("cart-actions", () => {
  it("rejects getCart without anonymousId", async () => {
    await expect(executeGetCart(createServer(), { anonymousId: "  " })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("applies server currency and country defaults on add", async () => {
    const server = createServer();
    const result = await executeAddToCart(server, {
      anonymousId: "anon-1",
      sku: "SHOE-RED",
    });

    expect(server.commercetools.addToCart).toHaveBeenCalledWith({
      anonymousId: "anon-1",
      sku: "SHOE-RED",
      productId: undefined,
      variantId: undefined,
      quantity: 1,
      currency: "EUR",
      country: "DE",
      catalogLocale: "en",
      cartId: undefined,
      customerId: undefined,
    });
    expect(result).toEqual({ cart: sampleCart });
  });

  it("forwards cartId on add", async () => {
    const server = createServer();
    await executeAddToCart(server, {
      anonymousId: "anon-1",
      sku: "SHOE-RED",
      cartId: "cart-1",
    });

    expect(server.commercetools.addToCart).toHaveBeenCalledWith(
      expect.objectContaining({ cartId: "cart-1" }),
    );
  });

  it("rejects oversized anonymousId", async () => {
    await expect(
      executeGetCart(createServer(), { anonymousId: "a".repeat(129) }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects quantity below 1 on add", async () => {
    await expect(
      executeAddToCart(createServer(), { anonymousId: "anon-1", sku: "SKU", quantity: 0 }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("removes a line item", async () => {
    const server = createServer();
    await executeRemoveFromCart(server, { anonymousId: "anon-1", lineItemId: "li-1" });

    expect(server.commercetools.removeLineItem).toHaveBeenCalledWith(
      expect.objectContaining({ anonymousId: "anon-1", lineItemId: "li-1" }),
    );
  });

  it("updates line item quantity", async () => {
    const server = createServer();
    await executeUpdateCartQuantity(server, {
      anonymousId: "anon-1",
      lineItemId: "li-1",
      quantity: 3,
    });

    expect(server.commercetools.changeLineItemQuantity).toHaveBeenCalledWith(
      expect.objectContaining({ quantity: 3, lineItemId: "li-1" }),
    );
  });

  it("uses the customer cart when a session token is present", async () => {
    const server = createServer();
    const sessionToken = signCartSession(
      { customerId: "cust-1", email: "ada@example.com" },
      "test-secret",
    );

    await executeGetCart(server, { sessionToken });

    expect(server.commercetools.getCustomerCart).toHaveBeenCalledWith("cust-1", "en");
    expect(server.commercetools.getCart).not.toHaveBeenCalled();
  });

  it("rejects an invalid session token", async () => {
    await expect(executeGetCart(createServer(), { sessionToken: "nope" })).rejects.toBeInstanceOf(
      InvalidCartSessionError,
    );
  });

  it("logs in, merges the anonymous cart, and returns a session token", async () => {
    const server = createServer();
    const customerCart = { ...sampleCart, customerId: "cust-1", anonymousId: undefined };
    vi.mocked(server.commercetools.loginAndMerge).mockResolvedValue({
      customer: { id: "cust-1", email: "ada@example.com" },
      cart: customerCart,
    });

    const result = await executeLogin(server, {
      email: "ada@example.com",
      password: "secret",
      anonymousId: "anon-1",
    });

    expect(server.commercetools.loginAndMerge).toHaveBeenCalledWith({
      email: "ada@example.com",
      password: "secret",
      anonymousId: "anon-1",
      cartId: undefined,
      catalogLocale: "en",
    });
    expect(result.customer).toEqual({ id: "cust-1", email: "ada@example.com" });
    expect(result.cart).toEqual(customerCart);
    expect(result.sessionToken).toEqual(expect.any(String));
  });

  it("rejects login without email or password", async () => {
    await expect(executeLogin(createServer(), { email: "", password: "x" })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("logs out without a cart or customer", async () => {
    await expect(executeLogout()).resolves.toEqual({ cart: null, customer: null });
  });
});
