import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveCommerceAISearchMessages } from "@commerce-ai-tool/core/client";
import { MAX_LINE_ITEM_QUANTITY } from "@commerce-ai-tool/core/client";
import type { CartSnapshot, CustomerSnapshot } from "@commerce-ai-tool/core/client";
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
  it("renders an empty state and expands sign-in on demand", () => {
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
    expect(screen.queryByLabelText(messages.email)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: messages.signInToSyncCart }));
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
    expect(screen.getByText(/€49\.99\s+each/)).not.toBeNull();
    expect(screen.getAllByText("€99.98")).toHaveLength(2);
    expect(screen.getByText(messages.total)).not.toBeNull();
    expect(screen.queryByRole("button", { name: messages.checkout })).toBeNull();
  });

  it("invokes checkout only when the host supplies a callback", () => {
    const onCheckout = vi.fn();
    render(
      <CartPanel
        cart={cart}
        isLoading={false}
        error={null}
        messages={messages}
        onClose={vi.fn()}
        onRemove={vi.fn()}
        onQuantityChange={vi.fn()}
        onCheckout={onCheckout}
        {...guestAuth}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: messages.checkout }));
    expect(onCheckout).toHaveBeenCalledWith(cart);
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
    fireEvent.click(screen.getByRole("button", { name: "Remove Red Shoe from cart" }));

    expect(onQuantityChange).toHaveBeenCalledWith("li-1", 3);
    expect(onRemove).toHaveBeenCalledWith("li-1");
  });

  it("names the quantity group and the remove button after the product", () => {
    render(
      <CartPanel
        cart={{
          ...cart,
          lineItems: [
            ...cart.lineItems,
            { id: "li-2", name: "Blue Shoe", sku: "SHOE-BLUE", productId: "p2", quantity: 1 },
          ],
        }}
        isLoading={false}
        error={null}
        messages={messages}
        onClose={vi.fn()}
        onRemove={vi.fn()}
        onQuantityChange={vi.fn()}
        {...guestAuth}
      />,
    );

    expect(screen.getByRole("group", { name: "Quantity of Red Shoe" })).not.toBeNull();
    expect(screen.getByRole("group", { name: "Quantity of Blue Shoe" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Remove Blue Shoe from cart" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: messages.removeItem })).toBeNull();
  });

  it("announces a changed quantity", () => {
    const props = {
      isLoading: false,
      error: null,
      messages,
      onClose: vi.fn(),
      onRemove: vi.fn(),
      onQuantityChange: vi.fn(),
      ...guestAuth,
    };
    const { rerender } = render(<CartPanel cart={cart} {...props} />);
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("2");

    rerender(
      <CartPanel cart={{ ...cart, lineItems: [{ ...cart.lineItems[0]!, quantity: 3 }] }} {...props} />,
    );

    // The same live region node changes its text, which is what a screen reader announces.
    expect(screen.getByRole("status")).toBe(status);
    expect(status.textContent).toBe("3");
  });

  it("renders the error it is given and never rewrites English text", () => {
    render(
      <CartPanel
        cart={cart}
        isLoading={false}
        error="Sign in failed"
        messages={{ ...messages, signInFailed: "Anmeldung fehlgeschlagen" }}
        onClose={vi.fn()}
        onRemove={vi.fn()}
        onQuantityChange={vi.fn()}
        {...guestAuth}
      />,
    );

    expect(screen.getByRole("alert").textContent).toBe("Sign in failed");
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

    fireEvent.click(screen.getByRole("button", { name: messages.signInToSyncCart }));
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

  it("disables the quantity increase button at the server maximum", () => {
    const atMax: CartSnapshot = {
      ...cart,
      lineItems: [{ ...cart.lineItems[0]!, quantity: MAX_LINE_ITEM_QUANTITY }],
    };
    const onQuantityChange = vi.fn();

    render(
      <CartPanel
        cart={atMax}
        isLoading={false}
        error={null}
        messages={messages}
        onClose={vi.fn()}
        onRemove={vi.fn()}
        onQuantityChange={onQuantityChange}
        {...guestAuth}
      />,
    );

    const plus = screen.getByRole("button", { name: messages.increaseQuantity }) as HTMLButtonElement;
    expect(plus.disabled).toBe(true);
    fireEvent.click(plus);
    expect(onQuantityChange).not.toHaveBeenCalled();
  });

  describe("focus management", () => {
    const originalMatchMedia = window.matchMedia;

    function stubFullScreen(matches: boolean) {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })) as unknown as typeof window.matchMedia;
    }

    afterEach(() => {
      window.matchMedia = originalMatchMedia;
      document.body.replaceChildren();
    });

    function renderPanel(props: Partial<React.ComponentProps<typeof CartPanel>> = {}) {
      return render(
        <CartPanel
          cart={cart}
          isLoading={false}
          error={null}
          messages={messages}
          onClose={vi.fn()}
          onRemove={vi.fn()}
          onQuantityChange={vi.fn()}
          {...guestAuth}
          {...props}
        />,
      );
    }

    it.each([true, false])("Escape closes the cart at every width (full-screen: %s)", (fullScreen) => {
      stubFullScreen(fullScreen);
      const onClose = vi.fn();
      renderPanel({ onClose });

      fireEvent.keyDown(document.body, { key: "Escape" });

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("leaves Escape from inside another dialog to that dialog", () => {
      stubFullScreen(false);
      const onClose = vi.fn();
      renderPanel({ onClose });
      const other = document.createElement("dialog");
      const inner = document.createElement("button");
      other.append(inner);
      document.body.append(other);

      fireEvent.keyDown(inner, { key: "Escape" });

      expect(onClose).not.toHaveBeenCalled();
    });

    it("closes on Escape when the host mounts the widget inside its own <dialog>", () => {
      stubFullScreen(false);
      const onClose = vi.fn();
      const hostDialog = document.createElement("dialog");
      hostDialog.setAttribute("open", "");
      const container = document.createElement("div");
      hostDialog.append(container);
      document.body.append(hostDialog);
      render(
        <CartPanel
          cart={cart}
          isLoading={false}
          error={null}
          messages={messages}
          onClose={onClose}
          onRemove={vi.fn()}
          onQuantityChange={vi.fn()}
          {...guestAuth}
        />,
        { container },
      );

      fireEvent.keyDown(screen.getByRole("button", { name: messages.closeCart }), { key: "Escape" });
      expect(onClose).toHaveBeenCalledTimes(1);

      // A dialog nested inside the widget (the camera) still owns its own Escape.
      const nested = document.createElement("dialog");
      const inner = document.createElement("button");
      nested.append(inner);
      container.append(nested);
      fireEvent.keyDown(inner, { key: "Escape" });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("ignores an Escape another widget control already handled", () => {
      stubFullScreen(false);
      const onClose = vi.fn();
      renderPanel({ onClose });
      const control = document.createElement("input");
      control.addEventListener("keydown", (event) => event.preventDefault());
      document.body.append(control);

      fireEvent.keyDown(control, { key: "Escape" });

      expect(onClose).not.toHaveBeenCalled();
    });

    it("ignores Escape while an IME composes", () => {
      stubFullScreen(false);
      const onClose = vi.fn();
      renderPanel({ onClose });

      fireEvent.keyDown(document.body, { key: "Escape", isComposing: true });

      expect(onClose).not.toHaveBeenCalled();
    });

    it("when full-screen, Tab wraps over the reachable controls only", () => {
      stubFullScreen(true);
      renderPanel({ onCheckout: vi.fn(), isLoading: true });
      const closeButton = screen.getByRole("button", { name: messages.closeCart });
      // While loading the quantity, remove and checkout buttons are disabled: the sign-in toggle is last.
      const signIn = screen.getByRole("button", { name: messages.signInToSyncCart });

      signIn.focus();
      const forward = createEvent.keyDown(signIn, { key: "Tab" });
      fireEvent(signIn, forward);

      expect(forward.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(closeButton);
    });

    it("moves focus to the decrease button when the increase button reaches the maximum", () => {
      stubFullScreen(false);
      const nearMax: CartSnapshot = {
        ...cart,
        lineItems: [{ ...cart.lineItems[0]!, quantity: MAX_LINE_ITEM_QUANTITY - 1 }],
      };
      const atMax: CartSnapshot = {
        ...cart,
        lineItems: [{ ...cart.lineItems[0]!, quantity: MAX_LINE_ITEM_QUANTITY }],
      };
      const props = {
        error: null,
        messages,
        onClose: vi.fn(),
        onRemove: vi.fn(),
        onQuantityChange: vi.fn(),
        ...guestAuth,
      };
      const view = render(<CartPanel cart={nearMax} isLoading={false} {...props} />);
      const plus = screen.getByRole("button", { name: messages.increaseQuantity });
      plus.focus();
      fireEvent.click(plus);

      // The mutation runs, then the new quantity arrives.
      view.rerender(<CartPanel cart={nearMax} isLoading {...props} />);
      view.rerender(<CartPanel cart={atMax} isLoading={false} {...props} />);

      expect((plus as HTMLButtonElement).disabled).toBe(true);
      expect(document.activeElement).toBe(screen.getByRole("button", { name: messages.decreaseQuantity }));
    });

    it("cart sheet has role=dialog and aria-modal only when full-screen", () => {
      stubFullScreen(true);
      const full = renderPanel();
      const sheet = screen.getByRole("dialog", { name: messages.cartAriaLabel });
      expect(sheet.getAttribute("aria-modal")).toBe("true");
      full.unmount();

      stubFullScreen(false);
      renderPanel();
      expect(screen.queryByRole("dialog")).toBeNull();
      const popover = screen.getByLabelText(messages.cartAriaLabel);
      expect(popover.hasAttribute("aria-modal")).toBe(false);
      expect(popover.hasAttribute("role")).toBe(false);
    });

    it("when full-screen, moves focus in on open and back to the cart toggle on close", () => {
      stubFullScreen(true);
      const toggle = document.createElement("button");
      document.body.append(toggle);
      toggle.focus();

      const view = renderPanel({ returnFocusTo: { current: toggle } });
      expect(document.activeElement).toBe(screen.getByRole("button", { name: messages.closeCart }));

      view.unmount();
      expect(document.activeElement).toBe(toggle);
    });

    it("when it is a popover, leaves focus where it is on open", () => {
      stubFullScreen(false);
      const toggle = document.createElement("button");
      document.body.append(toggle);
      toggle.focus();

      renderPanel({ returnFocusTo: { current: toggle } });

      expect(document.activeElement).toBe(toggle);
    });

    it("when full-screen, Tab wraps inside the sheet", () => {
      stubFullScreen(true);
      renderPanel({ onCheckout: vi.fn() });
      const closeButton = screen.getByRole("button", { name: messages.closeCart });
      const checkout = screen.getByRole("button", { name: messages.checkout });

      checkout.focus();
      const forward = createEvent.keyDown(checkout, { key: "Tab" });
      fireEvent(checkout, forward);
      expect(forward.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(closeButton);

      const backward = createEvent.keyDown(closeButton, { key: "Tab", shiftKey: true });
      fireEvent(closeButton, backward);
      expect(backward.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(checkout);
    });

    it("does not trap Tab when it is a popover", () => {
      stubFullScreen(false);
      renderPanel({ onCheckout: vi.fn() });
      const checkout = screen.getByRole("button", { name: messages.checkout });

      checkout.focus();
      const forward = createEvent.keyDown(checkout, { key: "Tab" });
      fireEvent(checkout, forward);

      expect(forward.defaultPrevented).toBe(false);
    });
  });
});
