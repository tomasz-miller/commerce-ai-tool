import type { Order, PaymentReference } from "@commercetools/platform-sdk";
import type {
  DeliverySnapshot,
  GetOrderRequest,
  ListOrdersRequest,
  OrderSnapshot,
  ShippingMethodSnapshot,
} from "../types/index.js";
import {
  escapePredicateString,
  formatMoney,
  mapCheckoutAddress,
  mapLineItemToSnapshot,
  resolveCartLocale,
} from "./cart.js";
import { mapPaymentToSnapshot, resolveExpandedPayment } from "./payment-map.js";

const DEFAULT_ORDER_LIST_LIMIT = 20;

export interface OrderGateway {
  queryOrders(where: string, options?: { limit?: number }): Promise<Order[]>;
}

export interface OrderOperations {
  getOrder(input: GetOrderRequest): Promise<OrderSnapshot>;
  listOrders(input: ListOrdersRequest): Promise<OrderSnapshot[]>;
}

export class OrderNotFoundError extends Error {
  constructor(message = "Order not found") {
    super(message);
    this.name = "OrderNotFoundError";
  }
}

export function buildAnonymousOrderWhere(orderNumber: string, anonymousId: string): string {
  return `orderNumber="${escapePredicateString(orderNumber)}" and anonymousId="${escapePredicateString(anonymousId)}"`;
}

export function buildCustomerOrderWhere(orderNumber: string, customerId: string): string {
  return `orderNumber="${escapePredicateString(orderNumber)}" and customerId="${escapePredicateString(customerId)}"`;
}

export function buildOwnerOrdersWhere(identity: {
  customerId?: string;
  anonymousId?: string;
}): string | undefined {
  if (identity.customerId && identity.anonymousId) {
    return `customerId="${escapePredicateString(identity.customerId)}" or anonymousId="${escapePredicateString(identity.anonymousId)}"`;
  }
  if (identity.customerId) {
    return `customerId="${escapePredicateString(identity.customerId)}"`;
  }
  if (identity.anonymousId) {
    return `anonymousId="${escapePredicateString(identity.anonymousId)}"`;
  }
  return undefined;
}

export function buildOwnerOrderWhere(
  orderNumber: string,
  identity: { customerId?: string; anonymousId?: string },
): string | undefined {
  if (identity.customerId && identity.anonymousId) {
    return `orderNumber="${escapePredicateString(orderNumber)}" and (${buildOwnerOrdersWhere(identity)})`;
  }
  if (identity.customerId) {
    return buildCustomerOrderWhere(orderNumber, identity.customerId);
  }
  if (identity.anonymousId) {
    return buildAnonymousOrderWhere(orderNumber, identity.anonymousId);
  }
  return undefined;
}

function mapShippingMethod(order: Order, locale: string): ShippingMethodSnapshot | undefined {
  if (!order.shippingInfo) {
    return undefined;
  }
  return {
    id: order.shippingInfo.shippingMethod?.id ?? "",
    name: order.shippingInfo.shippingMethodName,
    price: formatMoney(order.shippingInfo.price, locale),
  };
}

function mapDeliveries(order: Order): DeliverySnapshot[] | undefined {
  const deliveries = order.shippingInfo?.deliveries;
  if (!deliveries?.length) {
    return undefined;
  }

  const snapshots = deliveries.flatMap((delivery) =>
    (delivery.parcels ?? []).flatMap((parcel) => {
      const tracking = parcel.trackingData;
      if (!tracking?.trackingId && !tracking?.carrier && !tracking?.provider) {
        return [];
      }
      return [
        {
          id: parcel.id ?? delivery.id,
          trackingId: tracking.trackingId,
          carrier: tracking.carrier,
          provider: tracking.provider,
        },
      ];
    }),
  );

  return snapshots.length ? snapshots : undefined;
}

function mapOrderPayments(order: Order, locale: string): OrderSnapshot["payments"] {
  const refs = (order.paymentInfo?.payments ?? []) as PaymentReference[];
  const mapped = refs.flatMap((ref) => {
    const payment = resolveExpandedPayment(ref);
    return payment ? [mapPaymentToSnapshot(payment, locale)] : [];
  });
  return mapped.length ? mapped : undefined;
}

export function mapOrderToSnapshot(order: Order, locale: string): OrderSnapshot {
  const resolvedLocale = resolveCartLocale(locale);
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    orderState: order.orderState,
    createdAt: order.createdAt,
    paymentState: order.paymentState,
    shipmentState: order.shipmentState,
    customerEmail: order.customerEmail,
    totalPrice: formatMoney(order.totalPrice, resolvedLocale),
    lineItems: order.lineItems.map((item) => mapLineItemToSnapshot(item, resolvedLocale)),
    shippingAddress: mapCheckoutAddress(order.shippingAddress),
    billingAddress: mapCheckoutAddress(order.billingAddress),
    shippingMethod: mapShippingMethod(order, resolvedLocale),
    payments: mapOrderPayments(order, resolvedLocale),
    deliveries: mapDeliveries(order),
  };
}

function clampOrderListLimit(limit: number | undefined): number {
  const requested = limit ?? DEFAULT_ORDER_LIST_LIMIT;
  if (!Number.isFinite(requested)) {
    return DEFAULT_ORDER_LIST_LIMIT;
  }
  return Math.min(Math.max(Math.trunc(requested), 1), DEFAULT_ORDER_LIST_LIMIT);
}

export function createOrderOperations(gateway: OrderGateway): OrderOperations {
  return {
    async getOrder(input) {
      const orderNumber = input.orderNumber?.trim() ?? "";
      if (!orderNumber) {
        throw new OrderNotFoundError();
      }

      const where = buildOwnerOrderWhere(orderNumber, {
        customerId: input.customerId,
        anonymousId: input.anonymousId,
      });

      if (!where) {
        throw new OrderNotFoundError();
      }

      const [order] = await gateway.queryOrders(where, { limit: 1 });
      if (!order) {
        throw new OrderNotFoundError();
      }
      return mapOrderToSnapshot(order, resolveCartLocale(input.catalogLocale));
    },
    async listOrders(input) {
      const where = buildOwnerOrdersWhere({
        customerId: input.customerId,
        anonymousId: input.anonymousId,
      });
      if (!where) {
        return [];
      }

      const orders = await gateway.queryOrders(where, {
        limit: clampOrderListLimit(input.limit),
      });
      const locale = resolveCartLocale(input.catalogLocale);
      return orders.map((order) => mapOrderToSnapshot(order, locale));
    },
  };
}
