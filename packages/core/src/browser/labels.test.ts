import { describe, expect, it } from "vitest";
import { DEFAULT_COMMERCE_AI_SEARCH_MESSAGES, resolveCommerceAISearchMessages } from "../messages/index.js";
import { addToCartLabel, quantityGroupLabel, removeItemLabel } from "./labels.js";

const messages = DEFAULT_COMMERCE_AI_SEARCH_MESSAGES;

describe("addToCartLabel", () => {
  it("names the product", () => {
    expect(addToCartLabel(messages, { id: "p1", sku: "s1", name: "Running shoe" }, false)).toBe(
      "Add Running shoe to cart",
    );
  });

  it("reports the added state and the missing sku", () => {
    expect(addToCartLabel(messages, { id: "p1", name: "Running shoe" }, true)).toBe(messages.itemAdded);
    expect(addToCartLabel(messages, { id: "", name: "Running shoe" }, false)).toBe(
      messages.unableToAddToCart,
    );
  });

  it("falls back to the plain label for a nameless product", () => {
    expect(addToCartLabel(messages, { id: "p1", name: " " }, false)).toBe(messages.addToCart);
  });

  it("keeps a host's own wording when only addToCart was translated", () => {
    const host = resolveCommerceAISearchMessages({ addToCart: "Dodaj do koszyka" });
    expect(addToCartLabel(host, { id: "p1", name: "Buty" }, false)).toBe("Dodaj do koszyka: Buty");
  });
});

describe("cart line labels", () => {
  it("names the remove button and the quantity group", () => {
    expect(removeItemLabel(messages, "Running shoe")).toBe("Remove Running shoe from cart");
    expect(quantityGroupLabel(messages, "Running shoe")).toBe("Quantity of Running shoe");
    expect(removeItemLabel(messages, "")).toBe(messages.removeItem);
  });
});
