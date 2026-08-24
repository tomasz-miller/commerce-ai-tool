import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { resolveCommerceAISearchMessages } from "@commerce-ai-tool/core";
import type { CartSnapshot, CustomerSnapshot } from "@commerce-ai-tool/core";
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

const guestAuth = {
  customer: null as CustomerSnapshot | null,
  isLoggingIn: false,
  onLogin: vi.fn(),
  onLogout: vi.fn(),
};

describe("CartPanel", () => {
  it("renders an empty state and a sign-in form", () => {
    render(
      <CartPanel
        cart={null}
        isLoading={false}
        error={null}
        messages={messages}
        onClose={vi.fn()}
        onRemove={vi.fn()}
        onQuantityChange={vi.fn()}
        {...guestAuth}
      />,
    );

    expect(screen.getByText(messages.emptyCart)).not.toBeNull();
    expect(screen.getByLabelText(messages.email)).not.toBeNull();
    expect(screen.getByLabelText(messages.password)).not.toBeNull();
    expect(screen.getByRole("button", { name: messages.signIn })).not.toBeNull();
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
        {...guestAuth}
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
        {...guestAuth}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: messages.increaseQuantity }));
    fireEvent.click(screen.getByRole("button", { name: messages.removeItem }));

    expect(onQuantityChange).toHaveBeenCalledWith("li-1", 3);
    expect(onRemove).toHaveBeenCalledWith("li-1");
  });

  it("submits email and password", () => {
    const onLogin = vi.fn();

    render(
      <CartPanel
        cart={null}
        isLoading={false}
        error={null}
        messages={messages}
        onClose={vi.fn()}
        onRemove={vi.fn()}
        onQuantityChange={vi.fn()}
        customer={null}
        isLoggingIn={false}
        onLogin={onLogin}
        onLogout={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText(messages.email), {
      target: { value: "ada@example.com" },
    });
    fireEvent.change(screen.getByLabelText(messages.password), {
      target: { value: "secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: messages.signIn }));

    expect(onLogin).toHaveBeenCalledWith({ email: "ada@example.com", password: "secret" });
  });

  it("shows the signed-in state and signs out", () => {
    const onLogout = vi.fn();

    render(
      <CartPanel
        cart={null}
        isLoading={false}
        error={null}
        messages={messages}
        onClose={vi.fn()}
        onRemove={vi.fn()}
        onQuantityChange={vi.fn()}
        customer={{ id: "cust-1", email: "ada@example.com" }}
        isLoggingIn={false}
        onLogin={vi.fn()}
        onLogout={onLogout}
      />,
    );

    expect(screen.getByText(`${messages.signedInAs} ada@example.com`)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: messages.signOut }));
    expect(onLogout).toHaveBeenCalled();
  });
});
