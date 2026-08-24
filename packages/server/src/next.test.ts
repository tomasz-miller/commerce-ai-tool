import { CART_SESSION_HEADER, type CartSnapshot, type CommercetoolsClient, type SearchOrchestrator } from "@commerce-ai-tool/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { signCartSession } from "./cart-session.js";
import { createNextHandlers } from "./next.js";
import type { CommerceAIServer } from "./server.js";

vi.mock("./server.js", () => ({
  createCommerceAIServer: vi.fn(),
}));

import { createCommerceAIServer } from "./server.js";

const sampleCart: CartSnapshot = {
  id: "cart-1",
  version: 1,
  anonymousId: "anon-1",
  lineItems: [],
  totalPrice: { amount: 0, currency: "EUR", formatted: "€0.00" },
  totalQuantity: 0,
};

function createMockServer(): CommerceAIServer {
  return {
    orchestrator: {
      searchByText: vi.fn().mockResolvedValue({
        products: [],
        meta: { total: 0 },
      }),
      searchByVoice: vi.fn(),
      searchByImage: vi.fn(),
      suggestByText: vi.fn().mockResolvedValue({
        suggestions: ["Red Shoes"],
      }),
    } as unknown as SearchOrchestrator,
    commercetools: {
      getCart: vi.fn().mockResolvedValue(sampleCart),
      getCustomerCart: vi.fn().mockResolvedValue(sampleCart),
      addToCart: vi.fn().mockResolvedValue(sampleCart),
      removeLineItem: vi.fn().mockResolvedValue(sampleCart),
      changeLineItemQuantity: vi.fn().mockResolvedValue(sampleCart),
      loginAndMerge: vi.fn(),
    } as unknown as CommercetoolsClient,
    cartDefaults: { currency: "EUR", catalogLocale: "en" },
    cartSessionSecret: "test-secret",
    transcribeAudio: vi.fn(),
    synthesizeSpeech: vi.fn().mockResolvedValue(Buffer.from("mp3-bytes")),
  };
}

describe("createNextHandlers", () => {
  afterEach(() => {
    vi.mocked(createCommerceAIServer).mockReset();
  });

  it("search uses shared route actions", async () => {
    const server = createMockServer();
    vi.mocked(createCommerceAIServer).mockReturnValue(server);

    const handlers = createNextHandlers({} as never);
    const response = await handlers.search(
      new Request("http://localhost/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "hat" }),
      }),
    );

    expect(server.orchestrator.searchByText).toHaveBeenCalledWith(
      expect.objectContaining({ query: "hat" }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      products: [],
      meta: { total: 0 },
    });
  });

  it("searchSuggestions uses shared route actions", async () => {
    const server = createMockServer();
    vi.mocked(createCommerceAIServer).mockReturnValue(server);

    const handlers = createNextHandlers({} as never);
    const response = await handlers.searchSuggestions(
      new Request("http://localhost/search/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "red" }),
      }),
    );

    expect(server.orchestrator.suggestByText).toHaveBeenCalledWith(
      expect.objectContaining({ query: "red" }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      suggestions: ["Red Shoes"],
    });
  });

  it("health delegates to shared handlers", async () => {
    vi.mocked(createCommerceAIServer).mockReturnValue(createMockServer());

    const handlers = createNextHandlers({} as never);
    const response = await handlers.health();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("getCart uses shared cart actions", async () => {
    const server = createMockServer();
    vi.mocked(createCommerceAIServer).mockReturnValue(server);

    const handlers = createNextHandlers({} as never);
    const response = await handlers.getCart(
      new Request("http://localhost/cart?anonymousId=anon-1"),
    );

    expect(server.commercetools.getCart).toHaveBeenCalledWith("anon-1", "en");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ cart: sampleCart });
  });

  it("getCart reads the session from the cart session header", async () => {
    const server = createMockServer();
    vi.mocked(createCommerceAIServer).mockReturnValue(server);

    const token = signCartSession({ customerId: "cust-1", email: "ada@example.com" }, "test-secret");
    const handlers = createNextHandlers({} as never);
    const response = await handlers.getCart(
      new Request("http://localhost/cart", {
        headers: { [CART_SESSION_HEADER]: token },
      }),
    );

    expect(server.commercetools.getCustomerCart).toHaveBeenCalledWith("cust-1", "en");
    expect(server.commercetools.getCart).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it("getCart ignores sessionToken in the query string", async () => {
    const server = createMockServer();
    vi.mocked(createCommerceAIServer).mockReturnValue(server);

    const token = signCartSession({ customerId: "cust-1", email: "ada@example.com" }, "test-secret");
    const handlers = createNextHandlers({} as never);
    const response = await handlers.getCart(
      new Request(`http://localhost/cart?sessionToken=${encodeURIComponent(token)}`),
    );

    expect(server.commercetools.getCustomerCart).not.toHaveBeenCalled();
    expect(response.status).toBe(400);
  });

  it("addToCart uses shared cart actions", async () => {
    const server = createMockServer();
    vi.mocked(createCommerceAIServer).mockReturnValue(server);

    const handlers = createNextHandlers({} as never);
    const response = await handlers.addToCart(
      new Request("http://localhost/cart/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anonymousId: "anon-1", sku: "SHOE-RED" }),
      }),
    );

    expect(server.commercetools.addToCart).toHaveBeenCalledWith(
      expect.objectContaining({ anonymousId: "anon-1", sku: "SHOE-RED" }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ cart: sampleCart });
  });

  it("login uses shared cart actions", async () => {
    const server = createMockServer();
    vi.mocked(server.commercetools.loginAndMerge).mockResolvedValue({
      customer: { id: "cust-1", email: "ada@example.com" },
      cart: sampleCart,
    });
    vi.mocked(createCommerceAIServer).mockReturnValue(server);

    const handlers = createNextHandlers({} as never);
    const response = await handlers.login(
      new Request("http://localhost/cart/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "ada@example.com", password: "secret" }),
      }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { customer: { id: string }; sessionToken: string };
    expect(body.customer.id).toBe("cust-1");
    expect(body.sessionToken).toEqual(expect.any(String));
  });
});
