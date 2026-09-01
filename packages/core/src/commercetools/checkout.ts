import type {
  Cart,
  CartUpdateAction,
  Order,
  OrderUpdateAction,
  Payment,
  ShippingMethod,
} from "@commercetools/platform-sdk";
import type {
  CheckoutRequest,
  CreateOrderRequest,
  OrderSnapshot,
  SetCartAddressesRequest,
  SetShippingMethodRequest,
  ShippingMethodSnapshot,
} from "../types/index.js";
import {
  assertCartOwner,
  buildAnonymousCartWhere,
  buildCustomerCartWhere,
  CartNotFoundError,
  isConcurrentModification,
  mapCartToSnapshot,
  resolveCartLocale,
} from "./cart.js";
import { mapOrderToSnapshot } from "./order.js";
import { resolveCartPaymentCoverage, resolveOrderPaymentState } from "./payment-map.js";

export interface CheckoutGateway {
  queryCarts(where: string): Promise<Cart[]>;
  getCartById(id: string): Promise<Cart>;
  updateCart(id: string, version: number, actions: CartUpdateAction[]): Promise<Cart>;
  getShippingMethodsMatchingCart(cartId: string): Promise<ShippingMethod[]>;
  createOrderFromCart(input: {
    cartId: string;
    version: number;
    orderNumber: string;
  }): Promise<Order>;
  updateOrder(id: string, version: number, actions: OrderUpdateAction[]): Promise<Order>;
  getPaymentById(id: string): Promise<Payment>;
}

export interface CheckoutOperations {
  setCartAddresses(input: SetCartAddressesRequest): Promise<ReturnType<typeof mapCartToSnapshot>>;
  getShippingMethods(input: CheckoutRequest): Promise<ShippingMethodSnapshot[]>;
  setShippingMethod(
    input: SetShippingMethodRequest,
  ): Promise<ReturnType<typeof mapCartToSnapshot>>;
  createOrder(input: CreateOrderRequest): Promise<OrderSnapshot>;
}

export interface CheckoutOperationsOptions {
  requirePayment?: boolean;
}

export class CheckoutIncompleteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CheckoutIncompleteError";
  }
}

export function createCheckoutOrderNumber(): string {
  return `cat-${globalThis.crypto.randomUUID()}`;
}

export { mapOrderToSnapshot };

function mapShippingMethod(method: ShippingMethod): ShippingMethodSnapshot {
  return {
    id: method.id,
    name: method.name,
    description: method.description,
  };
}

export function createCheckoutOperations(
  gateway: CheckoutGateway,
  options: CheckoutOperationsOptions = {},
): CheckoutOperations {
  async function requireActiveCart(input: CheckoutRequest): Promise<Cart> {
    let cart: Cart | undefined;

    if (input.cartId) {
      cart = await gateway.getCartById(input.cartId);
      assertCartOwner(cart, input);
    } else if (input.customerId) {
      [cart] = await gateway.queryCarts(buildCustomerCartWhere(input.customerId));
    } else if (input.anonymousId) {
      [cart] = await gateway.queryCarts(buildAnonymousCartWhere(input.anonymousId));
    }

    if (!cart || cart.cartState !== "Active") {
      throw new CartNotFoundError();
    }
    return cart;
  }

  async function updateWithRetry(
    cart: Cart,
    actions: CartUpdateAction[],
  ): Promise<Cart> {
    try {
      return await gateway.updateCart(cart.id, cart.version, actions);
    } catch (error) {
      if (!isConcurrentModification(error)) {
        throw error;
      }
      const latest = await gateway.getCartById(cart.id);
      assertCartOwner(latest, {
        anonymousId: cart.anonymousId,
        customerId: cart.customerId,
      });
      return gateway.updateCart(latest.id, latest.version, actions);
    }
  }

  return {
    async setCartAddresses(input) {
      const cart = await requireActiveCart(input);
      const actions: CartUpdateAction[] = [
        { action: "setShippingAddress", address: input.shippingAddress },
        {
          action: "setBillingAddress",
          address: input.billingAddress ?? input.shippingAddress,
        },
      ];
      const updated = await updateWithRetry(cart, actions);
      return mapCartToSnapshot(updated, resolveCartLocale(input.catalogLocale));
    },

    async getShippingMethods(input) {
      const cart = await requireActiveCart(input);
      const methods = await gateway.getShippingMethodsMatchingCart(cart.id);
      return methods.map(mapShippingMethod);
    },

    async setShippingMethod(input) {
      const cart = await requireActiveCart(input);
      const updated = await updateWithRetry(cart, [
        {
          action: "setShippingMethod",
          shippingMethod: { typeId: "shipping-method", id: input.shippingMethodId },
        },
      ]);
      return mapCartToSnapshot(updated, resolveCartLocale(input.catalogLocale));
    },

    async createOrder(input) {
      const cart = await requireActiveCart(input);
      if (cart.lineItems.length === 0) {
        throw new CheckoutIncompleteError("Cart is empty");
      }
      if (!cart.shippingAddress) {
        throw new CheckoutIncompleteError("Shipping address is required");
      }

      const methods = await gateway.getShippingMethodsMatchingCart(cart.id);
      if (methods.length > 0 && !cart.shippingInfo) {
        throw new CheckoutIncompleteError("Shipping method is required");
      }

      if (options.requirePayment) {
        const coverage = await resolveCartPaymentCoverage(cart, (id) =>
          gateway.getPaymentById(id),
        );
        if (coverage === "missing") {
          throw new CheckoutIncompleteError("Payment is required");
        }
        if (coverage === "mismatch") {
          throw new CheckoutIncompleteError("Payment does not match the cart total");
        }
      }

      const locale = resolveCartLocale(input.catalogLocale);
      const order = await gateway.createOrderFromCart({
        cartId: cart.id,
        version: cart.version,
        orderNumber: input.orderNumber?.trim() || createCheckoutOrderNumber(),
      });

      const paymentState = await resolveOrderPaymentState(cart, (id) =>
        gateway.getPaymentById(id),
      );
      if (!paymentState) {
        return mapOrderToSnapshot(order, locale);
      }

      try {
        const updated = await gateway.updateOrder(order.id, order.version, [
          { action: "changePaymentState", paymentState },
        ]);
        return mapOrderToSnapshot(updated, locale);
      } catch {
        return { ...mapOrderToSnapshot(order, locale), paymentState };
      }
    },
  };
}
