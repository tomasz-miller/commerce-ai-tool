import type {
  Cart,
  CartDraft,
  CartUpdateAction,
  CustomerSignin,
  LineItem,
} from "@commercetools/platform-sdk";
import type {
  AddItemsToCartRequest,
  AddToCartRequest,
  CartLoginRequest,
  CartLoginResult,
  CartMutationRequest,
  CartSnapshot,
  CheckoutAddress,
  CustomerSnapshot,
  MoneyAmount,
  UpdateCartQuantityRequest,
} from "../types/index.js";
import { mapCartPayments } from "./payment-map.js";
import { commercetoolsErrorParts } from "./sdk-error.js";

export const DEFAULT_CART_CURRENCY = "EUR";
export const DEFAULT_CART_LOCALE = "en";

export interface CustomerLoginInput {
  email: string;
  password: string;
  /** Ownership-checked anonymous Cart to merge. The guest `anonymousId` is never sent. */
  anonymousCartId?: string;
}

export interface CustomerLoginResult {
  customer: CustomerSnapshot;
  cart?: Cart;
}

export interface CartGateway {
  queryCarts(where: string): Promise<Cart[]>;
  getCartById(id: string): Promise<Cart>;
  createCart(draft: CartDraft): Promise<Cart>;
  updateCart(id: string, version: number, actions: CartUpdateAction[]): Promise<Cart>;
  loginCustomer(input: CustomerLoginInput): Promise<CustomerLoginResult>;
}

export interface CartOperations {
  getCart(anonymousId: string, locale?: string): Promise<CartSnapshot | null>;
  getCustomerCart(customerId: string, locale?: string): Promise<CartSnapshot | null>;
  addToCart(input: AddToCartRequest): Promise<CartSnapshot>;
  addItemsToCart(input: AddItemsToCartRequest): Promise<CartSnapshot>;
  removeLineItem(input: CartMutationRequest): Promise<CartSnapshot>;
  changeLineItemQuantity(input: UpdateCartQuantityRequest): Promise<CartSnapshot>;
  loginAndMerge(input: CartLoginRequest): Promise<CartLoginResult>;
}

/**
 * CustomerSignin body. Only the verified `anonymousCart` is forwarded: `anonymousId` would make
 * commercetools assign every Cart, Order, ShoppingList and Payment with that id to the
 * signing-in Customer, and the id is a client-held bearer value.
 */
export function buildCustomerSignin(input: CustomerLoginInput): CustomerSignin {
  return {
    email: input.email,
    password: input.password,
    anonymousCartSignInMode: "MergeWithExistingCustomerCart",
    ...(input.anonymousCartId
      ? { anonymousCart: { typeId: "cart", id: input.anonymousCartId } }
      : {}),
  };
}

export function escapePredicateString(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

export function buildAnonymousCartWhere(anonymousId: string): string {
  return `anonymousId="${escapePredicateString(anonymousId)}" and cartState="Active"`;
}

export function buildCustomerCartWhere(customerId: string): string {
  return `customerId="${escapePredicateString(customerId)}" and cartState="Active"`;
}

export function formatMoney(
  money: { centAmount: number; currencyCode: string; fractionDigits?: number },
  locale: string,
): MoneyAmount {
  const fractionDigits = money.fractionDigits ?? 2;
  const amount = money.centAmount / Math.pow(10, fractionDigits);

  return {
    amount,
    currency: money.currencyCode,
    formatted: formatCurrency(amount, money.currencyCode, locale),
  };
}

/**
 * Formats a currency amount for display. An invalid locale (`RangeError`, for example
 * `en_GB`) falls back to the default locale so presentation can never fail a request.
 */
export function formatCurrency(amount: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
  } catch (error) {
    if (error instanceof RangeError && locale !== DEFAULT_CART_LOCALE) {
      return new Intl.NumberFormat(DEFAULT_CART_LOCALE, { style: "currency", currency }).format(
        amount,
      );
    }
    throw error;
  }
}

function localizedValue(
  value: Record<string, string> | undefined,
  locale: string,
): string | undefined {
  return value?.[locale] ?? value?.["en"] ?? Object.values(value ?? {})[0];
}

export function mapLineItemToSnapshot(
  lineItem: Pick<
    LineItem,
    "id" | "name" | "productId" | "quantity" | "price" | "totalPrice" | "variant"
  >,
  locale: string,
): CartSnapshot["lineItems"][number] {
  return {
    id: lineItem.id,
    name: localizedValue(lineItem.name, locale) ?? "Unnamed product",
    sku: lineItem.variant.sku,
    productId: lineItem.productId,
    quantity: lineItem.quantity,
    imageUrl: lineItem.variant.images?.[0]?.url,
    price: formatMoney(lineItem.price.value, locale),
    totalPrice: formatMoney(lineItem.totalPrice, locale),
  };
}

export function mapCheckoutAddress(
  address: Cart["shippingAddress"],
): CheckoutAddress | undefined {
  if (
    !address?.firstName ||
    !address.lastName ||
    !address.streetName ||
    !address.postalCode ||
    !address.city ||
    !address.country
  ) {
    return undefined;
  }

  return {
    firstName: address.firstName,
    lastName: address.lastName,
    streetName: address.streetName,
    additionalStreetInfo: address.additionalStreetInfo,
    postalCode: address.postalCode,
    city: address.city,
    region: address.region,
    country: address.country,
    email: address.email,
    phone: address.phone,
  };
}

export function mapCartToSnapshot(cart: Cart, locale: string): CartSnapshot {
  const lineItems = cart.lineItems.map((item) => mapLineItemToSnapshot(item, locale));
  const totalQuantity =
    cart.totalLineItemQuantity ??
    lineItems.reduce((sum, item) => sum + item.quantity, 0);

  return {
    id: cart.id,
    version: cart.version,
    anonymousId: cart.anonymousId,
    customerId: cart.customerId,
    lineItems,
    totalPrice: formatMoney(cart.totalPrice, locale),
    totalQuantity,
    shippingAddress: mapCheckoutAddress(cart.shippingAddress),
    billingAddress: mapCheckoutAddress(cart.billingAddress),
    shippingMethod: cart.shippingInfo?.shippingMethod
      ? {
          id: cart.shippingInfo.shippingMethod.id,
          name: cart.shippingInfo.shippingMethodName,
          price: formatMoney(cart.shippingInfo.price, locale),
        }
      : undefined,
    payments: mapCartPayments(cart, locale),
  };
}

export function resolveCartLocale(locale?: string): string {
  return locale?.trim() || DEFAULT_CART_LOCALE;
}

export function resolveLineItemDraft(input: AddToCartRequest): {
  sku?: string;
  productId?: string;
  variantId?: number;
  quantity: number;
} {
  const quantity = input.quantity ?? 1;
  const sku = input.sku?.trim() || undefined;
  const productId = input.productId?.trim() || undefined;

  // commercetools rejects addLineItem when both sku and productId are set.
  if (sku) {
    return { sku, productId: undefined, variantId: undefined, quantity };
  }

  return {
    sku: undefined,
    productId,
    variantId: input.variantId,
    quantity,
  };
}

export function assertAddToCartTarget(input: ReturnType<typeof resolveLineItemDraft>): void {
  if (!input.sku && !input.productId) {
    throw new Error("sku or productId is required");
  }
}

function toLineItemIdentifier(input: ReturnType<typeof resolveLineItemDraft>): {
  sku?: string;
  productId?: string;
  variantId?: number;
  quantity: number;
} {
  return {
    quantity: input.quantity,
    ...(input.sku ? { sku: input.sku } : {}),
    ...(input.productId ? { productId: input.productId } : {}),
    ...(input.variantId != null ? { variantId: input.variantId } : {}),
  };
}

function addLineItemActions(
  cart: Cart,
  input: { country?: string },
  addActions: CartUpdateAction[],
): CartUpdateAction[] {
  const country = input.country?.trim();
  const actions: CartUpdateAction[] = [];
  if (country && cart.country !== country) {
    actions.push({ action: "setCountry", country });
  }
  actions.push(...addActions);
  return actions;
}

export class CartNotFoundError extends Error {
  constructor(message = "Cart not found") {
    super(message);
    this.name = "CartNotFoundError";
  }
}

export class CartAccessDeniedError extends Error {
  constructor(message = "Cart does not belong to this session") {
    super(message);
    this.name = "CartAccessDeniedError";
  }
}

export class InvalidCredentialsError extends Error {
  constructor(message = "Invalid credentials") {
    super(message);
    this.name = "InvalidCredentialsError";
  }
}

export class MissingPriceError extends Error {
  constructor(message = "No matching price for this cart currency and country") {
    super(message);
    this.name = "MissingPriceError";
  }
}

/**
 * The documented failed sign-in: HTTP 400 with error code `InvalidCredentials`. Any other status,
 * a 401 from the API client's own token included, is an upstream problem and must not be shown to
 * the shopper as a wrong password (or counted against the per-email login limit).
 */
export function isInvalidCredentials(error: unknown): boolean {
  const { status, codes } = commercetoolsErrorParts(error);
  return (status === 400 || status === 401) && codes.includes("InvalidCredentials");
}

export function isConcurrentModification(error: unknown): boolean {
  const { status, codes } = commercetoolsErrorParts(error);
  return status === 409 || codes.includes("ConcurrentModification");
}

export function isMatchingPriceNotFound(error: unknown): boolean {
  const { status, codes, message } = commercetoolsErrorParts(error);
  if (codes.includes("MatchingPriceNotFound")) {
    return true;
  }
  return status === 400 && Boolean(message?.includes("does not contain a price"));
}

function toMissingPriceError(error: unknown): MissingPriceError {
  const message = error instanceof Error ? error.message : commercetoolsErrorParts(error).message;
  return new MissingPriceError(message);
}

export function assertCartOwner(
  cart: Cart,
  input: { anonymousId?: string; customerId?: string },
): void {
  if (input.customerId) {
    if (cart.customerId !== input.customerId) {
      throw new CartAccessDeniedError();
    }
    return;
  }

  if (input.anonymousId && cart.anonymousId !== input.anonymousId) {
    throw new CartAccessDeniedError();
  }
}

export function createCartOperations(gateway: CartGateway): CartOperations {
  async function findActiveAnonymousCart(anonymousId: string): Promise<Cart | null> {
    const results = await gateway.queryCarts(buildAnonymousCartWhere(anonymousId));
    return results[0] ?? null;
  }

  async function findActiveCustomerCart(customerId: string): Promise<Cart | null> {
    const results = await gateway.queryCarts(buildCustomerCartWhere(customerId));
    return results[0] ?? null;
  }

  async function resolveAnonymousCartIdForLogin(input: {
    anonymousId?: string;
    cartId?: string;
  }): Promise<string | undefined> {
    if (input.cartId) {
      if (!input.anonymousId) {
        throw new CartAccessDeniedError();
      }
      const cart = await gateway.getCartById(input.cartId);
      assertCartOwner(cart, { anonymousId: input.anonymousId });
      if (cart.cartState !== "Active") {
        throw new CartAccessDeniedError();
      }
      return cart.id;
    }

    if (input.anonymousId) {
      const anonymousCart = await findActiveAnonymousCart(input.anonymousId);
      return anonymousCart?.id;
    }

    return undefined;
  }

  /**
   * The cart behind a client-supplied `cartId`, or `null` when it is no longer usable. Ordered
   * and Merged carts accept no operations and Frozen ones reject line-item changes, so any
   * non-Active cart is unusable. Adds fall back to the identity's active cart; line-item
   * mutations throw CartNotFoundError. Ownership is checked first so another session's cart
   * is rejected instead of silently replaced.
   */
  async function findSuppliedActiveCart(input: {
    anonymousId?: string;
    customerId?: string;
    cartId?: string;
  }): Promise<Cart | null> {
    if (!input.cartId) {
      return null;
    }
    const cart = await gateway.getCartById(input.cartId);
    assertCartOwner(cart, input);
    return cart.cartState === "Active" ? cart : null;
  }

  async function requireActiveCart(
    input: { anonymousId?: string; customerId?: string; cartId?: string },
  ): Promise<Cart> {
    if (input.cartId) {
      // A line item id belongs to one cart, so a stale cartId must not be redirected to
      // another cart: the shopper gets CART_NOT_FOUND instead of editing the wrong cart.
      const cart = await findSuppliedActiveCart(input);
      if (!cart) {
        throw new CartNotFoundError();
      }
      return cart;
    }

    if (input.customerId) {
      const cart = await findActiveCustomerCart(input.customerId);
      if (!cart) {
        throw new CartNotFoundError();
      }
      return cart;
    }

    if (!input.anonymousId) {
      throw new CartNotFoundError();
    }

    const cart = await findActiveAnonymousCart(input.anonymousId);
    if (!cart) {
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
      return gateway.updateCart(latest.id, latest.version, actions);
    }
  }

  async function findExistingCart(input: {
    anonymousId?: string;
    customerId?: string;
  }): Promise<Cart | null> {
    if (input.customerId) {
      return findActiveCustomerCart(input.customerId);
    }
    if (input.anonymousId) {
      return findActiveAnonymousCart(input.anonymousId);
    }
    return null;
  }

  async function createCartWithItems(
    input: {
      country?: string;
      currency?: string;
      anonymousId?: string;
      customerId?: string;
    },
    lineItems: Array<ReturnType<typeof toLineItemIdentifier>>,
  ): Promise<Cart> {
    const draft = {
      currency: input.currency?.trim() || DEFAULT_CART_CURRENCY,
      country: input.country?.trim() || undefined,
      anonymousId: input.customerId ? undefined : input.anonymousId,
      customerId: input.customerId,
      lineItems,
    };

    try {
      return await gateway.createCart(draft);
    } catch (error) {
      // commercetools already falls back to country-less prices when a country is set, so
      // retrying without the country could not find another price.
      throw isMatchingPriceNotFound(error) ? toMissingPriceError(error) : error;
    }
  }

  async function addLineItems(
    cart: Cart,
    input: { country?: string },
    addActions: CartUpdateAction[],
  ): Promise<Cart> {
    const actions = addLineItemActions(cart, input, addActions);
    try {
      return await updateWithRetry(cart, actions);
    } catch (error) {
      if (!isMatchingPriceNotFound(error)) {
        throw error;
      }
      // The requested country has no price and the cart already has a country: keep it and add
      // without the prepended setCountry. The country is never unset, and a cart without one
      // is not retried, because commercetools already falls back to prices without a country.
      if (cart.country && actions.length > addActions.length) {
        try {
          return await updateWithRetry(cart, addActions);
        } catch (retryError) {
          if (!isMatchingPriceNotFound(retryError)) {
            throw retryError;
          }
        }
      }
      throw toMissingPriceError(error);
    }
  }

  function lineItemDraftsFromItems(
    items: Array<{ sku?: string; productId?: string; variantId?: number; quantity?: number }>,
  ) {
    return items.map((item) => {
      const lineItem = resolveLineItemDraft(item);
      assertAddToCartTarget(lineItem);
      return toLineItemIdentifier(lineItem);
    });
  }

  return {
    async getCart(anonymousId, locale) {
      const cart = await findActiveAnonymousCart(anonymousId);
      return cart ? mapCartToSnapshot(cart, resolveCartLocale(locale)) : null;
    },

    async getCustomerCart(customerId, locale) {
      const cart = await findActiveCustomerCart(customerId);
      return cart ? mapCartToSnapshot(cart, resolveCartLocale(locale)) : null;
    },

    async addToCart(input) {
      const locale = resolveCartLocale(input.catalogLocale);
      const lineItem = resolveLineItemDraft(input);
      assertAddToCartTarget(lineItem);
      const draft = toLineItemIdentifier(lineItem);
      const addActions: CartUpdateAction[] = [{ action: "addLineItem", ...draft }];

      const existing = (await findSuppliedActiveCart(input)) ?? (await findExistingCart(input));
      if (existing) {
        const updated = await addLineItems(existing, input, addActions);
        return mapCartToSnapshot(updated, locale);
      }

      try {
        const created = await createCartWithItems(input, [draft]);
        return mapCartToSnapshot(created, locale);
      } catch (error) {
        const raced = await findExistingCart(input);
        if (!raced) {
          throw error;
        }
        const updated = await addLineItems(raced, input, addActions);
        return mapCartToSnapshot(updated, locale);
      }
    },

    async addItemsToCart(input) {
      const locale = resolveCartLocale(input.catalogLocale);
      const drafts = lineItemDraftsFromItems(input.items);
      const addActions: CartUpdateAction[] = drafts.map((draft) => ({
        action: "addLineItem",
        ...draft,
      }));

      const existing = (await findSuppliedActiveCart(input)) ?? (await findExistingCart(input));
      if (existing) {
        const updated = await addLineItems(existing, input, addActions);
        return mapCartToSnapshot(updated, locale);
      }

      try {
        const created = await createCartWithItems(input, drafts);
        return mapCartToSnapshot(created, locale);
      } catch (error) {
        const raced = await findExistingCart(input);
        if (!raced) {
          throw error;
        }
        const updated = await addLineItems(raced, input, addActions);
        return mapCartToSnapshot(updated, locale);
      }
    },

    async removeLineItem(input) {
      const locale = resolveCartLocale(input.catalogLocale);
      const cart = await requireActiveCart(input);
      const updated = await updateWithRetry(cart, [
        { action: "removeLineItem", lineItemId: input.lineItemId },
      ]);
      return mapCartToSnapshot(updated, locale);
    },

    async changeLineItemQuantity(input) {
      const locale = resolveCartLocale(input.catalogLocale);
      const cart = await requireActiveCart(input);
      const updated = await updateWithRetry(cart, [
        {
          action: "changeLineItemQuantity",
          lineItemId: input.lineItemId,
          quantity: input.quantity,
        },
      ]);
      return mapCartToSnapshot(updated, locale);
    },

    async loginAndMerge(input) {
      const locale = resolveCartLocale(input.catalogLocale);
      const anonymousCartId = await resolveAnonymousCartIdForLogin(input);

      let result: CustomerLoginResult;
      try {
        result = await gateway.loginCustomer({
          email: input.email,
          password: input.password,
          anonymousCartId,
        });
      } catch (error) {
        if (isInvalidCredentials(error)) {
          throw new InvalidCredentialsError();
        }
        throw error;
      }

      const cart = result.cart
        ? mapCartToSnapshot(result.cart, locale)
        : await findActiveCustomerCart(result.customer.id).then((found) =>
            found ? mapCartToSnapshot(found, locale) : null,
          );

      return {
        customer: result.customer,
        cart,
      };
    },
  };
}
