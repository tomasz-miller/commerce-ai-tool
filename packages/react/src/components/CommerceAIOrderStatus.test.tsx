import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrderSnapshot } from "@commerce-ai-tool/core";
import type { UseCartReturn } from "../hooks/useCart.js";
import { useCart } from "../hooks/useCart.js";
import { CommerceAIOrderStatus } from "./CommerceAIOrderStatus.js";

vi.mock("../hooks/useCart.js", () => ({ useCart: vi.fn() }));

const order: OrderSnapshot = {
  id: "order-1",
  orderNumber: "cat-1",
  orderState: "Open",
  createdAt: "2026-04-01T12:00:00.000Z",
  paymentState: "Pending",
  shipmentState: "Shipped",
  totalPrice: { amount: 99, currency: "EUR", formatted: "€99.00" },
  lineItems: [
    {
      id: "line-1",
      name: "Running shoe",
      productId: "product-1",
      quantity: 1,
      price: { amount: 99, currency: "EUR", formatted: "€99.00" },
    },
  ],
  shippingAddress: {
    firstName: "Ada",
    lastName: "Lovelace",
    streetName: "Main Street",
    postalCode: "10115",
    city: "Berlin",
    country: "DE",
  },
  deliveries: [
    { id: "parcel-1", trackingId: "DHL-123", carrier: "DHL" },
  ],
};

function mockCart(overrides: Partial<UseCartReturn> = {}) {
  vi.mocked(useCart).mockReturnValue({
    cart: null,
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
    addItems: vi.fn(),
    removeFromCart: vi.fn(),
    updateQuantity: vi.fn(),
    setAddresses: vi.fn(),
    getShippingMethods: vi.fn(),
    setShippingMethod: vi.fn(),
    getPaymentMethods: vi.fn(),
    authorizePayment: vi.fn(),
    getOrder: vi.fn().mockResolvedValue(order),
    listOrders: vi.fn().mockResolvedValue([order]),
    placeOrder: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
    ...overrides,
  });
}

describe("CommerceAIOrderStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders confirmation, states, and tracking", async () => {
    mockCart();

    render(
      <CommerceAIOrderStatus apiBaseUrl="/api/commerce-ai" orderNumber="cat-1" />,
    );

    expect(await screen.findByRole("heading", { name: "cat-1" })).not.toBeNull();
    expect(screen.getByText("Pending")).not.toBeNull();
    expect(screen.getByText("Shipped")).not.toBeNull();
    expect(screen.getByText("DHL-123")).not.toBeNull();
    expect(screen.getByText(/Ada Lovelace/)).not.toBeNull();
    expect(screen.getByText(/2026-04-01 12:00 UTC/)).not.toBeNull();
  });

  it("shows a not-found state when the order is missing", async () => {
    mockCart({ getOrder: vi.fn().mockResolvedValue(null) });

    render(
      <CommerceAIOrderStatus apiBaseUrl="/api/commerce-ai" orderNumber="missing" />,
    );

    expect(await screen.findByText("Order not found")).not.toBeNull();
  });

  it("lists session orders when no order number is provided", async () => {
    mockCart();

    render(<CommerceAIOrderStatus apiBaseUrl="/api/commerce-ai" />);

    expect(await screen.findByRole("heading", { name: "Your orders" })).not.toBeNull();
    const link = screen.getByRole("link", { name: /cat-1/ });
    expect(link.getAttribute("href")).toBe("/orders?orderNumber=cat-1");
    expect(screen.getByText("€99.00")).not.toBeNull();
  });

  it("shows an empty state when the session has no orders", async () => {
    mockCart({ listOrders: vi.fn().mockResolvedValue([]) });

    render(<CommerceAIOrderStatus apiBaseUrl="/api/commerce-ai" orderNumber="" />);

    expect(await screen.findByText("No orders yet")).not.toBeNull();
  });
});
