import type {
  Cart,
  CartDraft,
  CartUpdateAction,
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

export const DEFAULT_CART_CURRENCY = "EUR";
export const DEFAULT_CART_LOCALE = "en";

export interface CustomerLoginInput {
  email: string;
  password: string;
  anonymousId?: string;
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
    formatted: new Intl.NumberFormat(locale, {
      style: "currency",
      currency: money.currencyCode,
    }).format(amount),
  };
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

function commercetoolsErrorParts(error: unknown): {
  status?: number;
  codes: string[];
  message?: string;
} {
  if (!error || typeof error !== "object") {
    return { codes: [] };
  }
  const candidate = error as {
    statusCode?: number;
    message?: string;
    body?: {
      statusCode?: number;
      message?: string;
      errors?: Array<{ code?: string; message?: string }>;
    };
  };
  const codes = (candidate.body?.errors ?? [])
    .map((item) => item.code)
    .filter((code): code is string => Boolean(code));
  return {
    status: candidate.statusCode ?? candidate.body?.statusCode,
    codes,
    message: candidate.body?.message ?? candidate.message,
  };
}

export function isInvalidCredentials(error: unknown): boolean {
  const { status, codes } = commercetoolsErrorParts(error);
  if (status !== 400 && status !== 401) {
    return false;
  }
  return codes.includes("InvalidCredentials") || status === 401;
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

  async function requireActiveCart(
    input: { anonymousId?: string; customerId?: string; cartId?: string },
  ): Promise<Cart> {
    if (input.cartId) {
      const cart = await gateway.getCartById(input.cartId);
      assertCartOwner(cart, input);
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

  async function createCartWithPriceFallback(
    input: {
      country?: string;
      currency?: string;
      anonymousId?: string;
      customerId?: string;
    },
    lineItems: Array<ReturnType<typeof toLineItemIdentifier>>,
  ): Promise<Cart> {
    const country = input.country?.trim() || undefined;
    const draft = {
      currency: input.currency?.trim() || DEFAULT_CART_CURRENCY,
      country,
      anonymousId: input.customerId ? undefined : input.anonymousId,
      customerId: input.customerId,
      lineItems,
    };

    try {
      return await gateway.createCart(draft);
    } catch (error) {
      if (!country || !isMatchingPriceNotFound(error)) {
        throw isMatchingPriceNotFound(error) ? toMissingPriceError(error) : error;
      }
      try {
        return await gateway.createCart({ ...draft, country: undefined });
      } catch (retryError) {
        throw isMatchingPriceNotFound(retryError) ? toMissingPriceError(retryError) : retryError;
      }
    }
  }

  async function addLineItemWithPriceFallback(
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

      const changedCountry = actions.some((action) => action.action === "setCountry");
      if (changedCountry) {
        try {
          return await updateWithRetry(cart, addActions);
        } catch (retryError) {
          if (!isMatchingPriceNotFound(retryError)) {
            throw retryError;
          }
        }
      }

      if (cart.country || changedCountry) {
        try {
          return await updateWithRetry(cart, [{ action: "setCountry" }, ...addActions]);
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

      if (input.cartId) {
        const cart = await requireActiveCart(input);
        const updated = await addLineItemWithPriceFallback(cart, input, addActions);
        return mapCartToSnapshot(updated, locale);
      }

      const existing = await findExistingCart(input);
      if (existing) {
        const updated = await addLineItemWithPriceFallback(existing, input, addActions);
        return mapCartToSnapshot(updated, locale);
      }

      try {
        const created = await createCartWithPriceFallback(input, [draft]);
        return mapCartToSnapshot(created, locale);
      } catch (error) {
        const raced = await findExistingCart(input);
        if (!raced) {
          throw error;
        }
        const updated = await addLineItemWithPriceFallback(raced, input, addActions);
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

      if (input.cartId) {
        const cart = await requireActiveCart(input);
        const updated = await addLineItemWithPriceFallback(cart, input, addActions);
        return mapCartToSnapshot(updated, locale);
      }

      const existing = await findExistingCart(input);
      if (existing) {
        const updated = await addLineItemWithPriceFallback(existing, input, addActions);
        return mapCartToSnapshot(updated, locale);
      }

      try {
        const created = await createCartWithPriceFallback(input, drafts);
        return mapCartToSnapshot(created, locale);
      } catch (error) {
        const raced = await findExistingCart(input);
        if (!raced) {
          throw error;
        }
        const updated = await addLineItemWithPriceFallback(raced, input, addActions);
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
          anonymousId: input.anonymousId,
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
