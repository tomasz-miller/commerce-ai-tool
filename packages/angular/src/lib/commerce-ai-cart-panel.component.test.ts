import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { BrowserTestingModule, platformBrowserTesting } from "@angular/platform-browser/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MAX_LINE_ITEM_QUANTITY, resolveCommerceAISearchMessages } from "@commerce-ai-tool/core/client";
import type { CartSnapshot } from "@commerce-ai-tool/core/client";
import { CommerceAiCartPanelComponent } from "./commerce-ai-cart-panel.component";

beforeAll(() => {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
});

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

const originalMatchMedia = window.matchMedia;

function stubFullScreen(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

describe("CommerceAiCartPanelComponent", () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    window.matchMedia = originalMatchMedia;
    document.body.replaceChildren();
  });

  async function renderWithCart(inputs: Record<string, unknown> = {}) {
    await TestBed.configureTestingModule({
      imports: [CommerceAiCartPanelComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    const fixture = TestBed.createComponent(CommerceAiCartPanelComponent);
    fixture.componentRef.setInput("messages", messages);
    fixture.componentRef.setInput("cart", cart);
    fixture.componentRef.setInput("showCheckout", true);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    document.body.append(fixture.nativeElement);
    await fixture.whenStable();
    return fixture;
  }

  const section = (fixture: { nativeElement: unknown }) =>
    (fixture.nativeElement as HTMLElement).querySelector("section") as HTMLElement;

  async function render() {
    await TestBed.configureTestingModule({
      imports: [CommerceAiCartPanelComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    const fixture = TestBed.createComponent(CommerceAiCartPanelComponent);
    fixture.componentRef.setInput("messages", resolveCommerceAISearchMessages());
    await fixture.whenStable();
    return fixture;
  }

  it("names the quantity group and the remove button after the product", async () => {
    const fixture = await renderWithCart({
      cart: {
        ...cart,
        lineItems: [
          ...cart.lineItems,
          { id: "li-2", name: "Blue Shoe", sku: "SHOE-BLUE", productId: "p2", quantity: 1 },
        ],
      },
    });
    const root = fixture.nativeElement as HTMLElement;

    const groups = Array.from(root.querySelectorAll('[role="group"]')).map((group) =>
      group.getAttribute("aria-label"),
    );
    expect(groups).toEqual(["Quantity of Red Shoe", "Quantity of Blue Shoe"]);
    const removes = Array.from(root.querySelectorAll(".cat-icon-btn")).map((button) =>
      button.getAttribute("aria-label"),
    );
    expect(removes).toContain("Remove Red Shoe from cart");
    expect(removes).toContain("Remove Blue Shoe from cart");
    expect(removes).not.toContain(messages.removeItem);
  });

  it("announces a changed quantity", async () => {
    const fixture = await renderWithCart();
    const value = (fixture.nativeElement as HTMLElement).querySelector(".cat-cart-item__qty-value");

    expect(value?.getAttribute("role")).toBe("status");
    expect(value?.textContent?.trim()).toBe("2");

    fixture.componentRef.setInput("cart", {
      ...cart,
      lineItems: [{ ...cart.lineItems[0]!, quantity: 3 }],
    });
    await fixture.whenStable();

    const after = (fixture.nativeElement as HTMLElement).querySelector(".cat-cart-item__qty-value");
    expect(after).toBe(value);
    expect(after?.textContent?.trim()).toBe("3");
  });

  it("renders the error it is given and never rewrites English text", async () => {
    const fixture = await renderWithCart({ error: "Sign in failed" });

    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent).toBe(
      "Sign in failed",
    );
  });

  it("emits login credentials and clears the password", async () => {
    const fixture = await render();
    const onLogin = vi.fn();
    fixture.componentInstance.login.subscribe(onLogin);

    fixture.componentInstance.email = "ada@example.com";
    fixture.componentInstance.password = "secret";
    fixture.componentInstance.onLoginSubmit();

    expect(onLogin).toHaveBeenCalledWith({ email: "ada@example.com", password: "secret" });
    expect(fixture.componentInstance.password).toBe("");
    expect(fixture.componentInstance.email).toBe("ada@example.com");
  });

  it("opens the sign-in form from the toggle without a manual render", async () => {
    const fixture = await render();
    const toggle = fixture.nativeElement.querySelector(
      ".cat-cart-panel__auth-toggle",
    ) as HTMLButtonElement;
    expect(fixture.nativeElement.querySelector(".cat-cart-panel__auth-form")).toBeNull();

    toggle.click();

    await vi.waitFor(() =>
      expect(fixture.nativeElement.querySelector(".cat-cart-panel__auth-form")).not.toBeNull(),
    );
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("disables the quantity increase button at the server maximum", async () => {
    const atMax: CartSnapshot = {
      ...cart,
      lineItems: [{ ...cart.lineItems[0]!, quantity: MAX_LINE_ITEM_QUANTITY }],
    };
    const fixture = await renderWithCart({ cart: atMax });
    const onQuantityChange = vi.fn();
    fixture.componentInstance.quantityChange.subscribe(onQuantityChange);

    const plus = (fixture.nativeElement as HTMLElement).querySelector(
      `[aria-label="${messages.increaseQuantity}"]`,
    ) as HTMLButtonElement;
    expect(plus.disabled).toBe(true);
    plus.click();
    expect(onQuantityChange).not.toHaveBeenCalled();
  });

  it.each([true, false])("Escape closes the cart at every width (full-screen: %s)", async (fullScreen) => {
    stubFullScreen(fullScreen);
    const fixture = await renderWithCart();
    const onClose = vi.fn();
    fixture.componentInstance.close.subscribe(onClose);

    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("leaves Escape from inside another dialog to that dialog", async () => {
    stubFullScreen(false);
    const fixture = await renderWithCart();
    const onClose = vi.fn();
    fixture.componentInstance.close.subscribe(onClose);
    const other = document.createElement("dialog");
    const inner = document.createElement("button");
    other.append(inner);
    document.body.append(other);

    inner.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on Escape when the host mounts the widget inside its own <dialog>", async () => {
    stubFullScreen(false);
    const hostDialog = document.createElement("dialog");
    hostDialog.setAttribute("open", "");
    document.body.append(hostDialog);
    const fixture = await renderWithCart();
    hostDialog.append(fixture.nativeElement);
    const onClose = vi.fn();
    fixture.componentInstance.close.subscribe(onClose);
    const closeButton = (fixture.nativeElement as HTMLElement).querySelector(
      `[aria-label="${messages.closeCart}"]`,
    ) as HTMLElement;

    closeButton.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(onClose).toHaveBeenCalledTimes(1);

    // A dialog nested inside the widget (the camera) still owns its own Escape.
    const nested = document.createElement("dialog");
    const inner = document.createElement("button");
    nested.append(inner);
    (fixture.nativeElement as HTMLElement).append(nested);
    inner.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignores Escape while an IME composes", async () => {
    stubFullScreen(false);
    const fixture = await renderWithCart();
    const onClose = vi.fn();
    fixture.componentInstance.close.subscribe(onClose);

    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, isComposing: true }));

    expect(onClose).not.toHaveBeenCalled();
  });

  it("when full-screen, Tab wraps over the reachable controls only", async () => {
    stubFullScreen(true);
    const fixture = await renderWithCart({ isLoading: true });
    const root = fixture.nativeElement as HTMLElement;
    const closeButton = root.querySelector(`[aria-label="${messages.closeCart}"]`) as HTMLElement;
    // While loading the quantity, remove and checkout buttons are disabled: the sign-in toggle is last.
    const signIn = root.querySelector(".cat-cart-panel__auth-toggle") as HTMLElement;

    signIn.focus();
    const forward = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    signIn.dispatchEvent(forward);

    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(closeButton);
  });

  it("moves focus to the decrease button when the increase button reaches the maximum", async () => {
    stubFullScreen(false);
    const withQuantity = (quantity: number): CartSnapshot => ({
      ...cart,
      lineItems: [{ ...cart.lineItems[0]!, quantity }],
    });
    const fixture = await renderWithCart({ cart: withQuantity(MAX_LINE_ITEM_QUANTITY - 1) });
    const root = fixture.nativeElement as HTMLElement;
    const plus = root.querySelector(`[aria-label="${messages.increaseQuantity}"]`) as HTMLButtonElement;
    plus.focus();
    plus.click();

    fixture.componentRef.setInput("isLoading", true);
    await fixture.whenStable();
    fixture.componentRef.setInput("cart", withQuantity(MAX_LINE_ITEM_QUANTITY));
    fixture.componentRef.setInput("isLoading", false);
    await fixture.whenStable();

    expect(plus.disabled).toBe(true);
    expect(document.activeElement).toBe(root.querySelector(`[aria-label="${messages.decreaseQuantity}"]`));
  });

  it("cart sheet has role=dialog and aria-modal only when full-screen", async () => {
    stubFullScreen(true);
    const full = await renderWithCart();
    expect(section(full).getAttribute("role")).toBe("dialog");
    expect(section(full).getAttribute("aria-modal")).toBe("true");
    expect(section(full).getAttribute("aria-label")).toBe(messages.cartAriaLabel);
    full.destroy();
    TestBed.resetTestingModule();
    document.body.replaceChildren();

    stubFullScreen(false);
    const popover = await renderWithCart();
    expect(section(popover).hasAttribute("role")).toBe(false);
    expect(section(popover).hasAttribute("aria-modal")).toBe(false);
  });

  it("when full-screen, moves focus in on open and back to the cart toggle on close", async () => {
    stubFullScreen(true);
    const toggle = document.createElement("button");
    document.body.append(toggle);
    toggle.focus();

    const fixture = await renderWithCart({ returnFocusTo: toggle });

    expect(document.activeElement).toBe(
      (fixture.nativeElement as HTMLElement).querySelector(`[aria-label="${messages.closeCart}"]`),
    );

    fixture.destroy();

    expect(document.activeElement).toBe(toggle);
  });

  it("when it is a popover, leaves focus where it is on open", async () => {
    stubFullScreen(false);
    const toggle = document.createElement("button");
    document.body.append(toggle);
    toggle.focus();

    await renderWithCart({ returnFocusTo: toggle });

    expect(document.activeElement).toBe(toggle);
  });

  it("when full-screen, Tab wraps inside the sheet", async () => {
    stubFullScreen(true);
    const fixture = await renderWithCart();
    const root = fixture.nativeElement as HTMLElement;
    const closeButton = root.querySelector(`[aria-label="${messages.closeCart}"]`) as HTMLElement;
    const checkout = root.querySelector(".cat-checkout-cta") as HTMLElement;

    checkout.focus();
    const forward = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    checkout.dispatchEvent(forward);
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(closeButton);

    const backward = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
    closeButton.dispatchEvent(backward);
    expect(backward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(checkout);
  });

  it("does not trap Tab when it is a popover", async () => {
    stubFullScreen(false);
    const fixture = await renderWithCart();
    const checkout = (fixture.nativeElement as HTMLElement).querySelector(".cat-checkout-cta") as HTMLElement;

    checkout.focus();
    const forward = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    checkout.dispatchEvent(forward);

    expect(forward.defaultPrevented).toBe(false);
  });
});
