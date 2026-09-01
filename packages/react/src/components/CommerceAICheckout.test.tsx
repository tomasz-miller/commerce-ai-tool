import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CartSnapshot } from "@commerce-ai-tool/core";
import { useCart } from "../hooks/useCart.js";
import { CommerceAICheckout } from "./CommerceAICheckout.js";

vi.mock("../hooks/useCart.js", () => ({ useCart: vi.fn() }));

const cart: CartSnapshot = {
  id: "cart-1",
  version: 1,
  anonymousId: "anon-1",
  lineItems: [
    {
      id: "line-1",
      name: "Running shoe",
      productId: "product-1",
      quantity: 1,
      price: { amount: 99, currency: "EUR", formatted: "€99.00" },
    },
  ],
  totalPrice: { amount: 99, currency: "EUR", formatted: "€99.00" },
  totalQuantity: 1,
};

function mockCartHook() {
  const setAddresses = vi.fn().mockResolvedValue(cart);
  const getShippingMethods = vi.fn().mockResolvedValue([
    { id: "shipping-1", name: "Standard delivery", description: "3–5 days" },
  ]);
  const setShippingMethod = vi.fn().mockResolvedValue({
    ...cart,
    shippingMethod: { id: "shipping-1", name: "Standard delivery" },
  });
  const getPaymentMethods = vi.fn().mockResolvedValue([]);
  const authorizePayment = vi.fn();
  const getOrder = vi.fn();
  const listOrders = vi.fn();
  const placeOrder = vi.fn().mockResolvedValue({
    id: "order-1",
    orderNumber: "cat-1",
    orderState: "Open",
    totalPrice: cart.totalPrice,
    lineItems: cart.lineItems,
  });

  vi.mocked(useCart).mockReturnValue({
    cart,
    anonymousId: "anon-1",
    customer: null,
    isAuthenticated: false,
    isLoading: false,
    isMutating: false,
    isLoggingIn: false,
    error: null,
    isCartOpen: false,
    openCart: vi.fn(),
    closeCart: vi.fn(),
    toggleCart: vi.fn(),
    addToCart: vi.fn(),
    removeFromCart: vi.fn(),
    updateQuantity: vi.fn(),
    setAddresses,
    getShippingMethods,
    setShippingMethod,
    getPaymentMethods,
    authorizePayment,
    getOrder,
    listOrders,
    placeOrder,
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  });

  return {
    setAddresses,
    getShippingMethods,
    setShippingMethod,
    getPaymentMethods,
    authorizePayment,
    getOrder,
    placeOrder,
  };
}

function fillRequiredAddress() {
  fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Ada" } });
  fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "Lovelace" } });
  fireEvent.change(screen.getByLabelText("Street address"), {
    target: { value: "Main Street" },
  });
  fireEvent.change(screen.getByLabelText("Postal code"), { target: { value: "10115" } });
  fireEvent.change(screen.getByLabelText("City"), { target: { value: "Berlin" } });
}

describe("CommerceAICheckout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("collects an address, selects delivery, and places an order", async () => {
    const actions = mockCartHook();
    render(<CommerceAICheckout apiBaseUrl="/api/commerce-ai" />);

    fillRequiredAddress();
    fireEvent.click(screen.getByRole("button", { name: "Continue to delivery" }));

    await waitFor(() => expect(actions.getShippingMethods).toHaveBeenCalled());
    const shippingMethod = screen.getByRole("button", { name: /Standard delivery/ });
    await waitFor(() => expect(shippingMethod.hasAttribute("disabled")).toBe(false));
    fireEvent.click(shippingMethod);
    await waitFor(() =>
      expect(actions.setShippingMethod).toHaveBeenCalledWith("shipping-1"),
    );

    const placeOrder = await waitFor(() => {
      const button = screen.getByRole("button", { name: "Place order" });
      expect(button.hasAttribute("disabled")).toBe(false);
      return button;
    });
    fireEvent.click(placeOrder);
    await waitFor(() => expect(actions.placeOrder).toHaveBeenCalled());
    expect(await screen.findByText("Order placed")).not.toBeNull();
    expect(screen.getByText("cat-1")).not.toBeNull();
    expect(screen.getByRole("link", { name: "View order status" }).getAttribute("href")).toBe(
      "/orders?orderNumber=cat-1",
    );
  });

  it("requires payment authorization when methods are offered", async () => {
    const actions = mockCartHook();
    actions.getPaymentMethods.mockResolvedValue([
      { method: "CREDIT_CARD", name: "Credit card" },
    ]);
    actions.authorizePayment.mockResolvedValue({
      id: "pay-1",
      paymentInterface: "MOCK",
      method: "CREDIT_CARD",
      status: "authorized",
      amount: cart.totalPrice,
    });
    render(<CommerceAICheckout apiBaseUrl="/api/commerce-ai" />);

    fillRequiredAddress();
    fireEvent.click(screen.getByRole("button", { name: "Continue to delivery" }));
    const shippingMethod = await waitFor(() => {
      const button = screen.getByRole("button", { name: /Standard delivery/ });
      expect(button.hasAttribute("disabled")).toBe(false);
      return button;
    });
    fireEvent.click(shippingMethod);
    await waitFor(() =>
      expect(actions.setShippingMethod).toHaveBeenCalledWith("shipping-1"),
    );

    const payment = await waitFor(() => screen.getByRole("button", { name: /Credit card/ }));
    expect(screen.getByRole("button", { name: "Place order" }).hasAttribute("disabled")).toBe(
      true,
    );
    fireEvent.click(payment);
    await waitFor(() => expect(actions.authorizePayment).toHaveBeenCalledWith("CREDIT_CARD"));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Place order" }).hasAttribute("disabled")).toBe(
        false,
      );
    });
  });

  it("keeps place order disabled when authorization is still pending", async () => {
    const actions = mockCartHook();
    actions.getPaymentMethods.mockResolvedValue([
      { method: "CREDIT_CARD", name: "Credit card" },
    ]);
    actions.authorizePayment.mockResolvedValue({
      id: "pay-1",
      paymentInterface: "MOCK",
      method: "CREDIT_CARD",
      status: "pending",
      amount: cart.totalPrice,
    });
    render(<CommerceAICheckout apiBaseUrl="/api/commerce-ai" />);

    fillRequiredAddress();
    fireEvent.click(screen.getByRole("button", { name: "Continue to delivery" }));
    const shippingMethod = await waitFor(() => {
      const button = screen.getByRole("button", { name: /Standard delivery/ });
      expect(button.hasAttribute("disabled")).toBe(false);
      return button;
    });
    fireEvent.click(shippingMethod);
    await waitFor(() =>
      expect(actions.setShippingMethod).toHaveBeenCalledWith("shipping-1"),
    );

    const payment = await waitFor(() => screen.getByRole("button", { name: /Credit card/ }));
    fireEvent.click(payment);
    await waitFor(() => expect(actions.authorizePayment).toHaveBeenCalledWith("CREDIT_CARD"));
    expect(screen.getByRole("button", { name: "Place order" }).hasAttribute("disabled")).toBe(
      true,
    );
  });

  it("does not skip payment when payment methods fail to load", async () => {
    const actions = mockCartHook();
    actions.getPaymentMethods.mockResolvedValue(null);
    render(<CommerceAICheckout apiBaseUrl="/api/commerce-ai" />);

    fillRequiredAddress();
    fireEvent.click(screen.getByRole("button", { name: "Continue to delivery" }));
    const shippingMethod = await waitFor(() => {
      const button = screen.getByRole("button", { name: /Standard delivery/ });
      expect(button.hasAttribute("disabled")).toBe(false);
      return button;
    });
    fireEvent.click(shippingMethod);
    await waitFor(() =>
      expect(actions.setShippingMethod).toHaveBeenCalledWith("shipping-1"),
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Payment method" })).not.toBeNull();
      expect(
        screen.getByRole("button", { name: "Place order" }).hasAttribute("disabled"),
      ).toBe(true);
    });
    expect(actions.placeOrder).not.toHaveBeenCalled();
  });

  it("allows placing an order when no shipping methods are available", async () => {
    const actions = mockCartHook();
    actions.getShippingMethods.mockResolvedValue([]);
    render(<CommerceAICheckout apiBaseUrl="/api/commerce-ai" />);

    fillRequiredAddress();
    fireEvent.click(screen.getByRole("button", { name: "Continue to delivery" }));

    await waitFor(() =>
      expect(screen.getByText(/No delivery methods are available/)).not.toBeNull(),
    );
    const placeOrder = await waitFor(() => {
      const button = screen.getByRole("button", { name: "Place order" });
      expect(button.hasAttribute("disabled")).toBe(false);
      return button;
    });
    fireEvent.click(placeOrder);
    await waitFor(() => expect(actions.placeOrder).toHaveBeenCalled());
  });

  it("keeps place order disabled when shipping methods fail to load", async () => {
    const actions = mockCartHook();
    actions.getShippingMethods.mockResolvedValue(null);
    render(<CommerceAICheckout apiBaseUrl="/api/commerce-ai" />);

    fillRequiredAddress();
    fireEvent.click(screen.getByRole("button", { name: "Continue to delivery" }));

    await waitFor(() => expect(actions.getShippingMethods).toHaveBeenCalled());
    await waitFor(() => {
      expect(screen.queryByText(/No delivery methods are available/)).toBeNull();
      expect(
        screen.getByRole("button", { name: "Place order" }).hasAttribute("disabled"),
      ).toBe(true);
    });
    expect(actions.placeOrder).not.toHaveBeenCalled();
  });

  it("hides delivery until the address is submitted and explains a disabled order action", () => {
    mockCartHook();
    render(<CommerceAICheckout apiBaseUrl="/api/commerce-ai" />);

    expect(screen.queryByRole("heading", { name: "Delivery method" })).toBeNull();
    expect(screen.getByRole("combobox", { name: "Country" })).not.toBeNull();
    expect(screen.getByText("Add a shipping address to continue")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Place order" }).hasAttribute("disabled")).toBe(
      true,
    );
  });

  it("labels countries in the catalog locale", () => {
    mockCartHook();
    render(
      <CommerceAICheckout apiBaseUrl="/api/commerce-ai" catalogLocale="de-DE" country="DE" />,
    );

    expect(screen.getByRole("option", { name: "Deutschland" })).not.toBeNull();
  });

  it("does not show an incomplete-checkout hint while placing an order", async () => {
    const actions = mockCartHook();
    let finishPlace!: (order: {
      id: string;
      orderNumber: string;
      orderState: string;
      totalPrice: CartSnapshot["totalPrice"];
      lineItems: CartSnapshot["lineItems"];
    }) => void;
    actions.placeOrder.mockReturnValue(
      new Promise((resolve) => {
        finishPlace = resolve;
      }),
    );

    render(<CommerceAICheckout apiBaseUrl="/api/commerce-ai" />);
    fillRequiredAddress();
    fireEvent.click(screen.getByRole("button", { name: "Continue to delivery" }));

    const shippingMethod = await waitFor(() => {
      const button = screen.getByRole("button", { name: /Standard delivery/ });
      expect(button.hasAttribute("disabled")).toBe(false);
      return button;
    });
    fireEvent.click(shippingMethod);
    await waitFor(() =>
      expect(actions.setShippingMethod).toHaveBeenCalledWith("shipping-1"),
    );

    const placeOrder = await waitFor(() => {
      const button = screen.getByRole("button", { name: "Place order" });
      expect(button.hasAttribute("disabled")).toBe(false);
      return button;
    });
    fireEvent.click(placeOrder);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Placing order/ })).not.toBeNull();
    });
    expect(screen.queryByText("Select a delivery method to continue")).toBeNull();
    expect(screen.queryByText("Add a shipping address to continue")).toBeNull();

    finishPlace({
      id: "order-1",
      orderNumber: "cat-1",
      orderState: "Open",
      totalPrice: cart.totalPrice,
      lineItems: cart.lineItems,
    });
    expect(await screen.findByText("Order placed")).not.toBeNull();
  });
});
