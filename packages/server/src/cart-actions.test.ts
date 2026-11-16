import type { CartSnapshot, CommercetoolsClient, SearchOrchestrator } from "@commerce-ai-tool/core";
import { describe, expect, it, vi } from "vitest";
import {
  executeAddToCart,
  executeAddItemsToCart,
  executeGetCart,
  executeLogin,
  executeLogout,
  executeRemoveFromCart,
  executeUpdateCartQuantity,
} from "./cart-actions.js";
import { ValidationError } from "./errors.js";
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
      addItemsToCart: vi.fn().mockResolvedValue(sampleCart),
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

  it("keeps body currency and country when no cartPolicy is configured", async () => {
    const server = createServer();
    await executeAddToCart(server, {
      anonymousId: "anon-1",
      sku: "SHOE-RED",
      currency: "USD",
      country: "US",
    });

    expect(server.commercetools.addToCart).toHaveBeenCalledWith(
      expect.objectContaining({ currency: "USD", country: "US" }),
    );
  });

  it("add-to-cart ignores a body currency not allowed by cartPolicy", async () => {
    // The resolved currency only applies when a guest's cart is created: commercetools cannot
    // change an existing cart's currency, so each call here is a different guest. A later add to
    // an existing EUR cart keeps EUR, and checkout rejects a CH (CHF) shipping address for it.
    const server = {
      ...createServer(),
      cartPolicy: {
        allowedCountries: ["DE", "AT", "CH"],
        currencyByCountry: { DE: "EUR", AT: "EUR", CH: "CHF" },
      },
    };

    await executeAddToCart(server, { anonymousId: "anon-de", sku: "S", currency: "USD", country: "de" });
    await executeAddToCart(server, { anonymousId: "anon-ch", sku: "S", currency: "EUR", country: "CH" });
    await executeAddToCart(server, { anonymousId: "anon-us", sku: "S", currency: "USD", country: "US" });
    await executeAddItemsToCart(server, {
      anonymousId: "anon-at",
      items: [{ sku: "S" }],
      currency: "JPY",
      country: "AT",
    });

    const calls = vi.mocked(server.commercetools.addToCart).mock.calls.map(([input]) => ({
      anonymousId: input.anonymousId,
      currency: input.currency,
      country: input.country,
    }));
    expect(calls).toEqual([
      { anonymousId: "anon-de", currency: "EUR", country: "DE" },
      { anonymousId: "anon-ch", currency: "CHF", country: "CH" },
      // Country outside the allowlist falls back to cartDefaults.country (DE -> EUR).
      { anonymousId: "anon-us", currency: "EUR", country: "DE" },
    ]);
    expect(server.commercetools.addItemsToCart).toHaveBeenCalledWith(
      expect.objectContaining({ currency: "EUR", country: "AT" }),
    );
  });

  it("falls back to cartDefaults.currency when cartPolicy has no mapping for the country", async () => {
    const server = { ...createServer(), cartPolicy: { allowedCountries: ["DE", "PL"] } };

    await executeAddToCart(server, { anonymousId: "anon-1", sku: "S", currency: "PLN", country: "PL" });

    expect(server.commercetools.addToCart).toHaveBeenCalledWith(
      expect.objectContaining({ currency: "EUR", country: "PL" }),
    );
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

  it("rejects quantity 1.5 on add, update and add-items", async () => {
    const server = createServer();

    await expect(
      executeAddToCart(server, { anonymousId: "anon-1", sku: "SKU", quantity: 1.5 }),
    ).rejects.toThrow("quantity must be an integer");
    await expect(
      executeUpdateCartQuantity(server, { anonymousId: "anon-1", lineItemId: "li-1", quantity: 1.5 }),
    ).rejects.toThrow("quantity must be an integer");
    await expect(
      executeAddItemsToCart(server, {
        anonymousId: "anon-1",
        items: [{ sku: "RACKET-1", quantity: 1.5 }],
      }),
    ).rejects.toThrow("items[0]: quantity must be an integer");

    expect(server.commercetools.addToCart).not.toHaveBeenCalled();
    expect(server.commercetools.changeLineItemQuantity).not.toHaveBeenCalled();
    expect(server.commercetools.addItemsToCart).not.toHaveBeenCalled();
  });

  it("caps quantity at MAX_LINE_ITEM_QUANTITY on add and update", async () => {
    const server = createServer();

    await expect(
      executeAddToCart(server, { anonymousId: "anon-1", sku: "SKU", quantity: 100 }),
    ).rejects.toThrow("quantity must be at most 99");
    await expect(
      executeUpdateCartQuantity(server, { anonymousId: "anon-1", lineItemId: "li-1", quantity: 1e9 }),
    ).rejects.toThrow("quantity must be at most 99");
  });

  it("still accepts quantity 0 on update (removes the line)", async () => {
    const server = createServer();
    await executeUpdateCartQuantity(server, { anonymousId: "anon-1", lineItemId: "li-1", quantity: 0 });

    expect(server.commercetools.changeLineItemQuantity).toHaveBeenCalledWith(
      expect.objectContaining({ quantity: 0 }),
    );
  });

  it("adds multiple items through addItemsToCart", async () => {
    const server = createServer();
    const result = await executeAddItemsToCart(server, {
      anonymousId: "anon-1",
      items: [
        { sku: "RACKET-1", quantity: 1 },
        { sku: "BALL-1", quantity: 2 },
      ],
    });

    expect(server.commercetools.addItemsToCart).toHaveBeenCalledWith({
      anonymousId: "anon-1",
      customerId: undefined,
      items: [
        { sku: "RACKET-1", productId: undefined, variantId: undefined, quantity: 1 },
        { sku: "BALL-1", productId: undefined, variantId: undefined, quantity: 2 },
      ],
      currency: "EUR",
      country: "DE",
      catalogLocale: "en",
      cartId: undefined,
    });
    expect(result).toEqual({ cart: sampleCart });
  });

  it("rejects line quantity above the max on addItemsToCart", async () => {
    await expect(
      executeAddItemsToCart(createServer(), {
        anonymousId: "anon-1",
        items: [{ sku: "RACKET-1", quantity: 100 }],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects empty items on addItemsToCart", async () => {
    await expect(
      executeAddItemsToCart(createServer(), { anonymousId: "anon-1", items: [] }),
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
    const sessionToken = signCartSession({ customerId: "cust-1" }, "test-secret");

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

  it("does not put the email into the issued session token", async () => {
    const server = createServer();
    vi.mocked(server.commercetools.loginAndMerge).mockResolvedValue({
      customer: { id: "cust-1", email: "shopper@example.test" },
      cart: sampleCart,
    });

    const result = await executeLogin(server, { email: "shopper@example.test", password: "pw" });

    const [encoded] = (result.sessionToken ?? "").split(".");
    const payload = JSON.parse(Buffer.from(encoded ?? "", "base64url").toString("utf8"));
    expect(Object.keys(payload).sort()).toEqual(["customerId", "exp", "iat"]);
    expect(result.customer).toEqual({ id: "cust-1", email: "shopper@example.test" });
  });

  it("rejects cart reads and mutations with a revoked session token", async () => {
    const isRevoked = vi.fn().mockResolvedValue(true);
    const server = { ...createServer(), cartSessionHooks: { isRevoked } };
    const sessionToken = signCartSession({ customerId: "cust-1" }, "test-secret");

    await expect(executeGetCart(server, { sessionToken })).rejects.toBeInstanceOf(
      InvalidCartSessionError,
    );
    await expect(
      executeAddToCart(server, { sessionToken, sku: "SKU-1" }),
    ).rejects.toBeInstanceOf(InvalidCartSessionError);
    expect(server.commercetools.getCustomerCart).not.toHaveBeenCalled();
    expect(server.commercetools.addToCart).not.toHaveBeenCalled();
    expect(isRevoked).toHaveBeenCalledWith({ customerId: "cust-1", iat: expect.any(Number) });
  });

  it("does not consult isRevoked for guest requests", async () => {
    const isRevoked = vi.fn().mockResolvedValue(true);
    const server = { ...createServer(), cartSessionHooks: { isRevoked } };

    await executeGetCart(server, { anonymousId: "anon-1" });

    expect(isRevoked).not.toHaveBeenCalled();
  });

  it("logs out without a cart or customer", async () => {
    await expect(executeLogout(createServer())).resolves.toEqual({ cart: null, customer: null });
  });

  it("logout calls onLogout with the verified payload", async () => {
    const onLogout = vi.fn().mockResolvedValue(undefined);
    const server = { ...createServer(), cartSessionHooks: { onLogout } };
    const now = Math.floor(Date.now() / 1000);
    const sessionToken = signCartSession({ customerId: "cust-1" }, "test-secret", now);

    await expect(executeLogout(server, sessionToken)).resolves.toEqual({
      cart: null,
      customer: null,
    });
    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(onLogout).toHaveBeenCalledWith({ customerId: "cust-1", iat: now, exp: now + 86_400 });
  });

  it("logout without a token, or with an invalid or revoked one, skips onLogout", async () => {
    const onLogout = vi.fn();
    const isRevoked = vi.fn().mockReturnValue(true);
    const server = { ...createServer(), cartSessionHooks: { onLogout, isRevoked } };
    const revoked = signCartSession({ customerId: "cust-1" }, "test-secret");

    for (const token of [undefined, "", "not-a-token", `${revoked}x`, revoked]) {
      await expect(executeLogout(server, token)).resolves.toEqual({ cart: null, customer: null });
    }
    expect(onLogout).not.toHaveBeenCalled();
  });
});
