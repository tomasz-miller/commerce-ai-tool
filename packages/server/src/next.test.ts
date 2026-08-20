import type { CartSnapshot, CommercetoolsClient, SearchOrchestrator } from "@commerce-ai-tool/core";
import { afterEach, describe, expect, it, vi } from "vitest";
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
      addToCart: vi.fn().mockResolvedValue(sampleCart),
      removeLineItem: vi.fn().mockResolvedValue(sampleCart),
      changeLineItemQuantity: vi.fn().mockResolvedValue(sampleCart),
    } as unknown as CommercetoolsClient,
    cartDefaults: { currency: "EUR", catalogLocale: "en" },
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
});
