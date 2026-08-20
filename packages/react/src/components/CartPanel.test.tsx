import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { resolveCommerceAISearchMessages } from "@commerce-ai-tool/core";
import type { CartSnapshot } from "@commerce-ai-tool/core";
import { CartPanel } from "./CartPanel.js";

const messages = resolveCommerceAISearchMessages();

const cart: CartSnapshot = {
  id: "cart-1",
  version: 1,
  anonymousId: "anon-1",
  lineItems: [
    {
      id: "li-1",
      name: "Red Shoe",
      sku: "SHOE-RED",
      productId: "p1",
      quantity: 2,
      price: { amount: 49.99, currency: "EUR", formatted: "€49.99" },
    },
  ],
  totalPrice: { amount: 99.98, currency: "EUR", formatted: "€99.98" },
  totalQuantity: 2,
};

describe("CartPanel", () => {
  it("renders an empty state", () => {
    render(
      <CartPanel
        cart={null}
        isLoading={false}
        error={null}
        messages={messages}
        onClose={vi.fn()}
        onRemove={vi.fn()}
        onQuantityChange={vi.fn()}
      />,
    );

    expect(screen.getByText(messages.emptyCart)).not.toBeNull();
  });

  it("renders line items and total", () => {
    render(
      <CartPanel
        cart={cart}
        isLoading={false}
        error={null}
        messages={messages}
        onClose={vi.fn()}
        onRemove={vi.fn()}
        onQuantityChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Red Shoe")).not.toBeNull();
    expect(screen.getByText("€49.99")).not.toBeNull();
    expect(screen.getByText("€99.98")).not.toBeNull();
    expect(screen.getByText(messages.total)).not.toBeNull();
  });

  it("invokes quantity and remove handlers", () => {
    const onRemove = vi.fn();
    const onQuantityChange = vi.fn();

    render(
      <CartPanel
        cart={cart}
        isLoading={false}
        error={null}
        messages={messages}
        onClose={vi.fn()}
        onRemove={onRemove}
        onQuantityChange={onQuantityChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: messages.increaseQuantity }));
    fireEvent.click(screen.getByRole("button", { name: messages.removeItem }));

    expect(onQuantityChange).toHaveBeenCalledWith("li-1", 3);
    expect(onRemove).toHaveBeenCalledWith("li-1");
  });
});
