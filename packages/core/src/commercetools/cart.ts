import type {
  Cart,
  CartDraft,
  CartUpdateAction,
  LineItem,
} from "@commercetools/platform-sdk";
import type {
  AddToCartRequest,
  CartMutationRequest,
  CartSnapshot,
  MoneyAmount,
  UpdateCartQuantityRequest,
} from "../types/index.js";

export const DEFAULT_CART_CURRENCY = "EUR";
export const DEFAULT_CART_LOCALE = "en";

export interface CartGateway {
  queryCarts(where: string): Promise<Cart[]>;
  getCartById(id: string): Promise<Cart>;
  createCart(draft: CartDraft): Promise<Cart>;
  updateCart(id: string, version: number, actions: CartUpdateAction[]): Promise<Cart>;
}

export interface CartOperations {
  getCart(anonymousId: string, locale?: string): Promise<CartSnapshot | null>;
  addToCart(input: AddToCartRequest): Promise<CartSnapshot>;
  removeLineItem(input: CartMutationRequest): Promise<CartSnapshot>;
  changeLineItemQuantity(input: UpdateCartQuantityRequest): Promise<CartSnapshot>;
}

export function escapePredicateString(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

export function buildAnonymousCartWhere(anonymousId: string): string {
  return `anonymousId="${escapePredicateString(anonymousId)}" and cartState="Active"`;
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
  lineItem: Pick<LineItem, "id" | "name" | "productId" | "quantity" | "price" | "variant">,
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
    lineItems,
    totalPrice: formatMoney(cart.totalPrice, locale),
    totalQuantity,
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

export function isConcurrentModification(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { statusCode?: number; body?: { statusCode?: number; errors?: Array<{ code?: string }> } };
  const status = candidate.statusCode ?? candidate.body?.statusCode;
  if (status === 409) {
    return true;
  }

  return candidate.body?.errors?.some((item) => item.code === "ConcurrentModification") ?? false;
}

export function createCartOperations(gateway: CartGateway): CartOperations {
  async function findActiveCart(anonymousId: string): Promise<Cart | null> {
    const results = await gateway.queryCarts(buildAnonymousCartWhere(anonymousId));
    return results[0] ?? null;
  }

  async function requireActiveCart(
    input: { anonymousId: string; cartId?: string },
  ): Promise<Cart> {
    if (input.cartId) {
      const cart = await gateway.getCartById(input.cartId);
      if (cart.anonymousId !== input.anonymousId) {
        throw new CartAccessDeniedError();
      }
      return cart;
    }

    const cart = await findActiveCart(input.anonymousId);
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

  return {
    async getCart(anonymousId, locale) {
      const cart = await findActiveCart(anonymousId);
      return cart ? mapCartToSnapshot(cart, resolveCartLocale(locale)) : null;
    },

    async addToCart(input) {
      const locale = resolveCartLocale(input.catalogLocale);
      const lineItem = resolveLineItemDraft(input);
      assertAddToCartTarget(lineItem);
      const draft = toLineItemIdentifier(lineItem);
      const addAction: CartUpdateAction = { action: "addLineItem", ...draft };

      if (input.cartId) {
        const cart = await requireActiveCart(input);
        const updated = await updateWithRetry(cart, [addAction]);
        return mapCartToSnapshot(updated, locale);
      }

      const existing = await findActiveCart(input.anonymousId);
      if (existing) {
        const updated = await updateWithRetry(existing, [addAction]);
        return mapCartToSnapshot(updated, locale);
      }

      try {
        const created = await gateway.createCart({
          currency: input.currency?.trim() || DEFAULT_CART_CURRENCY,
          country: input.country?.trim() || undefined,
          anonymousId: input.anonymousId,
          lineItems: [draft],
        });
        return mapCartToSnapshot(created, locale);
      } catch (error) {
        const raced = await findActiveCart(input.anonymousId);
        if (!raced) {
          throw error;
        }
        const updated = await updateWithRetry(raced, [addAction]);
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
  };
}
