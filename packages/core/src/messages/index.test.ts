import { describe, expect, it } from "vitest";
import {
  DEFAULT_COMMERCE_AI_SEARCH_MESSAGES,
  formatNamedMessage,
  resolveCommerceAISearchMessages,
  type CommerceAISearchMessages,
} from "./index.js";

describe("resolveCommerceAISearchMessages", () => {
  it("returns defaults when no overrides are provided", () => {
    expect(resolveCommerceAISearchMessages()).toEqual(DEFAULT_COMMERCE_AI_SEARCH_MESSAGES);
  });

  it("merges partial overrides", () => {
    expect(
      resolveCommerceAISearchMessages({
        placeholder: "Szukaj produktów",
        searching: "Szukam...",
      }),
    ).toEqual({
      ...DEFAULT_COMMERCE_AI_SEARCH_MESSAGES,
      placeholder: "Szukaj produktów",
      searching: "Szukam...",
    });
  });

  it("treats an override set to undefined as not overridden", () => {
    const resolved = resolveCommerceAISearchMessages({
      searching: undefined,
      addToCartNamed: undefined,
      addToCart: "Dodaj do koszyka",
      removeItem: undefined,
    });

    expect(resolved.searching).toBe(DEFAULT_COMMERCE_AI_SEARCH_MESSAGES.searching);
    expect(resolved.removeItem).toBe(DEFAULT_COMMERCE_AI_SEARCH_MESSAGES.removeItem);
    expect(resolved.removeItemNamed).toBe(DEFAULT_COMMERCE_AI_SEARCH_MESSAGES.removeItemNamed);
    expect(resolved.addToCartNamed).toBe("Dodaj do koszyka: {name}");
    expect(() => formatNamedMessage(resolved.addToCartNamed, "Buty")).not.toThrow();
    expect(
      resolveCommerceAISearchMessages({ addToCartNamed: undefined }).addToCartNamed,
    ).toBe(DEFAULT_COMMERCE_AI_SEARCH_MESSAGES.addToCartNamed);
  });

  it("treats an override set to null (JSON config, JS callers) like undefined", () => {
    const resolved = resolveCommerceAISearchMessages({
      searching: null,
      addToCart: null,
      addToCartNamed: null,
      removeItem: "Usuń",
      removeItemNamed: null,
    } as unknown as Partial<CommerceAISearchMessages>);

    expect(resolved.searching).toBe(DEFAULT_COMMERCE_AI_SEARCH_MESSAGES.searching);
    expect(resolved.addToCart).toBe(DEFAULT_COMMERCE_AI_SEARCH_MESSAGES.addToCart);
    expect(resolved.addToCartNamed).toBe(DEFAULT_COMMERCE_AI_SEARCH_MESSAGES.addToCartNamed);
    expect(resolved.removeItemNamed).toBe("Usuń: {name}");
  });

  it("ships English defaults for the error and announcement keys", () => {
    const messages = resolveCommerceAISearchMessages();
    for (const key of [
      "microphoneDenied",
      "microphoneUnavailable",
      "cameraDenied",
      "cameraNotFound",
      "cameraInUse",
      "cameraUnavailable",
      "rateLimited",
      "resultsCount",
      "cartLoadFailed",
      "searching",
    ] as const) {
      expect(messages[key], key).toBeTruthy();
    }
    expect(messages.resultsCount).toContain("{count}");
  });
});

describe("formatNamedMessage", () => {
  it("fills {name}", () => {
    expect(formatNamedMessage("Add {name} to cart", "Running shoe")).toBe("Add Running shoe to cart");
  });

  it("appends the name to a template without the placeholder", () => {
    expect(formatNamedMessage("Dodaj do koszyka", "Buty")).toBe("Dodaj do koszyka: Buty");
  });

  it("drops the placeholder for an empty name", () => {
    expect(formatNamedMessage("Add {name} to cart", "  ")).toBe("Add to cart");
  });
});
