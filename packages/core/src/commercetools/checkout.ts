import type {
  Cart,
  CartUpdateAction,
  Order,
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
  formatMoney,
  isConcurrentModification,
  mapCartToSnapshot,
  mapLineItemToSnapshot,
  resolveCartLocale,
} from "./cart.js";

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
}

export interface CheckoutOperations {
  setCartAddresses(input: SetCartAddressesRequest): Promise<ReturnType<typeof mapCartToSnapshot>>;
  getShippingMethods(input: CheckoutRequest): Promise<ShippingMethodSnapshot[]>;
  setShippingMethod(
    input: SetShippingMethodRequest,
  ): Promise<ReturnType<typeof mapCartToSnapshot>>;
  createOrder(input: CreateOrderRequest): Promise<OrderSnapshot>;
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

export function mapOrderToSnapshot(order: Order, locale: string): OrderSnapshot {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    orderState: order.orderState,
    totalPrice: formatMoney(order.totalPrice, locale),
    lineItems: order.lineItems.map((item) => mapLineItemToSnapshot(item, locale)),
  };
}

function mapShippingMethod(method: ShippingMethod): ShippingMethodSnapshot {
  return {
    id: method.id,
    name: method.name,
    description: method.description,
  };
}

export function createCheckoutOperations(gateway: CheckoutGateway): CheckoutOperations {
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

      const order = await gateway.createOrderFromCart({
        cartId: cart.id,
        version: cart.version,
        orderNumber: input.orderNumber?.trim() || createCheckoutOrderNumber(),
      });
      return mapOrderToSnapshot(order, resolveCartLocale(input.catalogLocale));
    },
  };
}
