import type {
  Cart,
  CartUpdateAction,
  Order,
  Payment,
  PaymentState,
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
  isMatchingPriceNotFound,
  mapCartToSnapshot,
  MissingPriceError,
  resolveCartLocale,
} from "./cart.js";
import { mapOrderToSnapshot } from "./order.js";
import { createRandomUuid } from "../utils/random-uuid.js";
import {
  loadCartPayments,
  resolveCartPaymentCoverage,
  resolveOrderPaymentState,
} from "./payment-map.js";

export interface CheckoutGateway {
  queryCarts(where: string): Promise<Cart[]>;
  getCartById(id: string): Promise<Cart>;
  updateCart(id: string, version: number, actions: CartUpdateAction[]): Promise<Cart>;
  getShippingMethodsMatchingCart(cartId: string): Promise<ShippingMethod[]>;
  createOrderFromCart(input: {
    cartId: string;
    version: number;
    orderNumber: string;
    paymentState?: PaymentState;
  }): Promise<Order>;
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

const MAX_SCOPE_UPDATE_ATTEMPTS = 3;

/** `cartPolicy` subset enforced against the shipping address at checkout and payment. */
export interface ShippingScopeOptions {
  /** `cartPolicy.allowedCountries`: shipping countries outside it are rejected. */
  allowedCountries?: string[];
  /**
   * `cartPolicy.currencyByCountry`: a mapped shipping country must match the cart currency.
   * commercetools cannot change a cart's currency, so a mismatch is rejected, not repaired.
   */
  currencyByCountry?: Record<string, string>;
}

export interface CheckoutOperationsOptions extends ShippingScopeOptions {
  requirePayment?: boolean;
}

export class CheckoutIncompleteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CheckoutIncompleteError";
  }
}

/** Shipping country outside `cartPolicy.allowedCountries`; the host maps it to 400 VALIDATION. */
export class CountryNotAllowedError extends Error {
  constructor(message = "Shipping country is not allowed") {
    super(message);
    this.name = "CountryNotAllowedError";
  }
}

/** Cart currency differs from `cartPolicy.currencyByCountry[shippingCountry]`; maps to 400 VALIDATION. */
export class CurrencyMismatchError extends Error {
  constructor(message = "The cart currency does not match the shipping country") {
    super(message);
    this.name = "CurrencyMismatchError";
  }
}

/**
 * Keeps the cart price scope bound to the shipping address. Price selection uses
 * `cart.country` and `cart.totalPrice.currencyCode`, so both must follow the shipping country:
 * otherwise a shopper can pick a cheaper country-scoped or currency price and ship elsewhere.
 */
export function createShippingScope(
  gateway: Pick<CheckoutGateway, "getCartById" | "updateCart">,
  options: ShippingScopeOptions = {},
) {
  const allowedCountries = options.allowedCountries?.length
    ? new Set(options.allowedCountries.map((country) => country.toUpperCase()))
    : undefined;
  const currencyByCountry = options.currencyByCountry
    ? new Map(
        Object.entries(options.currencyByCountry).map(([country, currency]) => [
          country.toUpperCase(),
          currency.toUpperCase(),
        ]),
      )
    : undefined;

  async function updateWithRetry(cart: Cart, actions: CartUpdateAction[]): Promise<Cart> {
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

  /** Rejects a shipping country outside the policy or one priced in another currency. */
  function assertAllowed(cart: Cart, country: string | undefined): void {
    const code = (country ?? "").toUpperCase();
    if (allowedCountries && !allowedCountries.has(code)) {
      throw new CountryNotAllowedError();
    }
    const expected = currencyByCountry?.get(code);
    if (expected && cart.totalPrice.currencyCode.toUpperCase() !== expected) {
      throw new CurrencyMismatchError();
    }
  }

  function setCountryActions(cart: Cart, country: string): CartUpdateAction[] {
    return cart.country === country ? [] : [{ action: "setCountry", country }];
  }

  /**
   * Applies price-scope actions rebuilt from the cart they are sent against. On a concurrent
   * modification the latest cart is re-read and `build` runs again, so policy checks and
   * `setCountry` always reflect the version commercetools accepts. `build` may throw (policy)
   * or return `[]` (nothing to do). No matching price maps to MISSING_PRICE.
   */
  async function updateRebuilt(
    cart: Cart,
    build: (current: Cart) => CartUpdateAction[],
  ): Promise<Cart> {
    let current = cart;
    for (let attempt = 1; ; attempt += 1) {
      const actions = build(current);
      if (actions.length === 0) {
        return current;
      }
      try {
        return await gateway.updateCart(current.id, current.version, actions);
      } catch (error) {
        if (isMatchingPriceNotFound(error)) {
          throw new MissingPriceError("A cart item has no price for the shipping country");
        }
        if (!isConcurrentModification(error) || attempt >= MAX_SCOPE_UPDATE_ATTEMPTS) {
          throw error;
        }
        const latest = await gateway.getCartById(current.id);
        assertCartOwner(latest, {
          anonymousId: cart.anonymousId,
          customerId: cart.customerId,
        });
        if (latest.cartState !== "Active") {
          throw new CartNotFoundError();
        }
        current = latest;
      }
    }
  }

  /**
   * Before an amount is fixed (payment, order): validates the shipping country of the version
   * being updated against the policy and re-applies it as the cart country, since a later add
   * can switch it back.
   */
  function reconcile(cart: Cart): Promise<Cart> {
    return updateRebuilt(cart, (current) => {
      const country = current.shippingAddress?.country;
      if (!country) {
        return [];
      }
      assertAllowed(current, country);
      return setCountryActions(current, country);
    });
  }

  /**
   * Final check on the exact version an amount or order is created from: the cart country
   * equals the shipping country and the policy holds. A later change gets a 409 from
   * commercetools because the draft carries this version.
   */
  function assertReconciled(cart: Cart): void {
    const country = cart.shippingAddress?.country;
    if (!country) {
      throw new CheckoutIncompleteError("Shipping address is required");
    }
    if (cart.country !== country) {
      throw new CheckoutIncompleteError("Cart country does not match the shipping address");
    }
    assertAllowed(cart, country);
  }

  return {
    updateWithRetry,
    updateRebuilt,
    assertAllowed,
    setCountryActions,
    reconcile,
    assertReconciled,
  };
}

export function createCheckoutOrderNumber(): string {
  return `cat-${createRandomUuid()}`;
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

  const scope = createShippingScope(gateway, options);
  const updateWithRetry = scope.updateWithRetry;

  return {
    async setCartAddresses(input) {
      const cart = await requireActiveCart(input);
      const country = input.shippingAddress.country;
      const updated = await scope.updateRebuilt(cart, (current) => {
        scope.assertAllowed(current, country);
        return [
          { action: "setShippingAddress", address: input.shippingAddress },
          {
            action: "setBillingAddress",
            address: input.billingAddress ?? input.shippingAddress,
          },
          ...scope.setCountryActions(current, country),
        ];
      });
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
      let cart = await requireActiveCart(input);
      if (cart.lineItems.length === 0) {
        throw new CheckoutIncompleteError("Cart is empty");
      }
      if (!cart.shippingAddress) {
        throw new CheckoutIncompleteError("Shipping address is required");
      }

      // Re-price before the shipping and payment checks so they see the final total.
      cart = await scope.reconcile(cart);

      const methods = await gateway.getShippingMethodsMatchingCart(cart.id);
      if (methods.length > 0 && !cart.shippingInfo) {
        throw new CheckoutIncompleteError("Shipping method is required");
      }

      // One fetch feeds both the coverage check and the paymentState below.
      const payments = await loadCartPayments(cart, (id) => gateway.getPaymentById(id));
      if (options.requirePayment) {
        const coverage = resolveCartPaymentCoverage(payments, cart);
        if (coverage === "missing") {
          throw new CheckoutIncompleteError("Payment is required");
        }
        if (coverage === "mismatch") {
          throw new CheckoutIncompleteError("Payment does not match the cart total");
        }
      }

      const locale = resolveCartLocale(input.catalogLocale);
      scope.assertReconciled(cart);
      // paymentState goes into the order draft: a follow-up changePaymentState could fail
      // after the order exists and leave the persisted state different from the one returned.
      const paymentState = resolveOrderPaymentState(payments);
      const order = await gateway.createOrderFromCart({
        cartId: cart.id,
        version: cart.version,
        orderNumber: input.orderNumber?.trim() || createCheckoutOrderNumber(),
        ...(paymentState ? { paymentState } : {}),
      });
      return mapOrderToSnapshot(order, locale);
    },
  };
}
