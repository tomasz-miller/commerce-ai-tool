import { describe, expect, it, vi } from "vitest";
import type { Order } from "@commercetools/platform-sdk";
import {
  OrderNotFoundError,
  buildAnonymousOrderWhere,
  buildCustomerOrderWhere,
  buildOwnerOrdersWhere,
  createOrderOperations,
  mapOrderToSnapshot,
  type OrderGateway,
} from "./order.js";

function money(centAmount: number) {
  return {
    type: "centPrecision" as const,
    centAmount,
    currencyCode: "EUR",
    fractionDigits: 2,
  };
}

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    version: 1,
    createdAt: "2026-04-01T12:00:00.000Z",
    lastModifiedAt: "2026-04-01T12:00:00.000Z",
    orderNumber: "cat-1",
    orderState: "Open",
    paymentState: "Pending",
    shipmentState: "Shipped",
    customerEmail: "ada@example.com",
    anonymousId: "anon-1",
    lineItems: [
      {
        id: "line-1",
        productId: "product-1",
        name: { en: "Running shoe" },
        productType: { typeId: "product-type", id: "type-1" },
        variant: { id: 1, sku: "RUN-1" },
        price: { id: "price-1", value: money(9900) },
        quantity: 1,
        totalPrice: money(9900),
      },
    ],
    customLineItems: [],
    totalPrice: money(9900),
    taxMode: "Platform",
    taxRoundingMode: "HalfEven",
    taxCalculationMode: "LineItemLevel",
    inventoryMode: "None",
    shippingMode: "Single",
    shipping: [],
    itemShippingAddresses: [],
    refusedGifts: [],
    origin: "Customer",
    syncInfo: [],
    returnInfo: [],
    shippingAddress: {
      firstName: "Ada",
      lastName: "Lovelace",
      streetName: "Main Street",
      postalCode: "10115",
      city: "Berlin",
      country: "DE",
    },
    shippingInfo: {
      shippingMethodName: "Standard delivery",
      price: money(500),
      shippingRate: { price: money(500), tiers: [] },
      taxRate: undefined,
      taxedPrice: undefined,
      discountedPrice: undefined,
      shippingMethod: { typeId: "shipping-method", id: "shipping-1" },
      shippingMethodState: "MatchesCart",
      deliveries: [
        {
          id: "delivery-1",
          createdAt: "2026-04-02T09:00:00.000Z",
          items: [],
          parcels: [
            {
              id: "parcel-1",
              createdAt: "2026-04-02T09:00:00.000Z",
              trackingData: {
                trackingId: "DHL-123",
                carrier: "DHL",
                provider: "dhl",
                isReturn: false,
              },
            },
          ],
        },
      ],
    },
    paymentInfo: {
      payments: [
        {
          typeId: "payment",
          id: "pay-1",
          obj: {
            id: "pay-1",
            version: 1,
            createdAt: "2026-04-01T12:00:00.000Z",
            lastModifiedAt: "2026-04-01T12:00:00.000Z",
            amountPlanned: money(9900),
            paymentMethodInfo: { paymentInterface: "MOCK", method: "CREDIT_CARD" },
            paymentStatus: {},
            transactions: [
              {
                id: "tx-1",
                type: "Authorization",
                amount: money(9900),
                state: "Success",
              },
            ],
            interfaceInteractions: [],
          },
        },
      ],
    },
    ...overrides,
  } as unknown as Order;
}

describe("createOrderOperations", () => {
  it("looks up an order by number and anonymous owner", async () => {
    const api: OrderGateway = { queryOrders: vi.fn().mockResolvedValue([order()]) };
    const orders = createOrderOperations(api);

    const snapshot = await orders.getOrder({
      orderNumber: "cat-1",
      anonymousId: "anon-1",
    });

    expect(api.queryOrders).toHaveBeenCalledWith(
      'orderNumber="cat-1" and anonymousId="anon-1"',
      { limit: 1 },
    );
    expect(snapshot).toMatchObject({
      id: "order-1",
      orderNumber: "cat-1",
      paymentState: "Pending",
      shipmentState: "Shipped",
      deliveries: [{ trackingId: "DHL-123", carrier: "DHL" }],
      payments: [{ id: "pay-1", method: "CREDIT_CARD", status: "authorized" }],
    });
  });

  it("uses a customer predicate when a customer session is present", async () => {
    const api: OrderGateway = { queryOrders: vi.fn().mockResolvedValue([order()]) };
    const orders = createOrderOperations(api);

    await orders.getOrder({ orderNumber: "cat-1", customerId: "cust-1" });

    expect(api.queryOrders).toHaveBeenCalledWith(
      'orderNumber="cat-1" and customerId="cust-1"',
      { limit: 1 },
    );
  });

  it("keeps guest orders visible after login when anonymousId is also provided", async () => {
    const api: OrderGateway = { queryOrders: vi.fn().mockResolvedValue([order()]) };
    const orders = createOrderOperations(api);

    await orders.getOrder({
      orderNumber: "cat-1",
      customerId: "cust-1",
      anonymousId: "anon-1",
    });

    expect(api.queryOrders).toHaveBeenCalledWith(
      'orderNumber="cat-1" and (customerId="cust-1" or anonymousId="anon-1")',
      { limit: 1 },
    );
  });

  it("lists session orders by owner without an order number", async () => {
    const api: OrderGateway = { queryOrders: vi.fn().mockResolvedValue([order()]) };
    const orders = createOrderOperations(api);

    const snapshots = await orders.listOrders({
      customerId: "cust-1",
      anonymousId: "anon-1",
    });

    expect(api.queryOrders).toHaveBeenCalledWith(
      'customerId="cust-1" or anonymousId="anon-1"',
      { limit: 20 },
    );
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.orderNumber).toBe("cat-1");
  });

  it("returns an empty list when no cart identity is present", async () => {
    const api: OrderGateway = { queryOrders: vi.fn() };
    const orders = createOrderOperations(api);

    await expect(orders.listOrders({})).resolves.toEqual([]);
    expect(api.queryOrders).not.toHaveBeenCalled();
  });

  it("clamps the order list limit", async () => {
    const api: OrderGateway = { queryOrders: vi.fn().mockResolvedValue([]) };
    const orders = createOrderOperations(api);

    await orders.listOrders({ anonymousId: "anon-1", limit: 500 });
    expect(api.queryOrders).toHaveBeenCalledWith('anonymousId="anon-1"', { limit: 20 });
  });

  it("returns OrderNotFoundError instead of leaking another customer's order", async () => {
    const api: OrderGateway = { queryOrders: vi.fn().mockResolvedValue([]) };
    const orders = createOrderOperations(api);

    await expect(
      orders.getOrder({ orderNumber: "cat-1", anonymousId: "other-anon" }),
    ).rejects.toBeInstanceOf(OrderNotFoundError);
  });

  it("maps tracking data from parcels", () => {
    const snapshot = mapOrderToSnapshot(order(), "en");
    expect(snapshot.deliveries).toEqual([
      {
        id: "parcel-1",
        trackingId: "DHL-123",
        carrier: "DHL",
        provider: "dhl",
      },
    ]);
  });

  it("builds owner-scoped predicates", () => {
    expect(buildAnonymousOrderWhere('cat-"1"', "anon-1")).toBe(
      'orderNumber="cat-\\"1\\"" and anonymousId="anon-1"',
    );
    expect(buildCustomerOrderWhere("cat-1", "cust-1")).toBe(
      'orderNumber="cat-1" and customerId="cust-1"',
    );
    expect(buildOwnerOrdersWhere({ customerId: "cust-1", anonymousId: "anon-1" })).toBe(
      'customerId="cust-1" or anonymousId="anon-1"',
    );
  });
});
