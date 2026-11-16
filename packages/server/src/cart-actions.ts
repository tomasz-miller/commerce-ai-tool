import {
  MAX_LINE_ITEM_QUANTITY,
  type AddItemsToCartRequest,
  type AddToCartRequest,
  type CartAuthResponse,
  type CartLoginRequest,
  type CartMutationRequest,
  type CartResponse,
  type GetCartRequest,
  type UpdateCartQuantityRequest,
} from "@commerce-ai-tool/core";
import type { CommerceAIServer } from "./server.js";
import { ValidationError } from "./errors.js";
import { parseQuantity } from "./input-limits.js";
import {
  InvalidCartSessionError,
  authenticateCartSession,
  signCartSession,
  type CartSessionPayload,
} from "./cart-session.js";
import { normalizeLocale } from "./utils/locale.js";

export type { CartAuthResponse, CartResponse };

export const ANONYMOUS_ID_MAX_LENGTH = 128;

function requiredAnonymousId(value: unknown): string {
  const anonymousId = requiredString(value, "anonymousId");
  if (anonymousId.length > ANONYMOUS_ID_MAX_LENGTH) {
    throw new ValidationError("anonymousId is too long");
  }
  return anonymousId;
}

function optionalAnonymousId(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }
  if (value.trim().length > ANONYMOUS_ID_MAX_LENGTH) {
    throw new ValidationError("anonymousId is too long");
  }
  return value.trim();
}

export function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ValidationError(`${field} is required`);
  }
  return value.trim();
}

export function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function isAbsent(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

export function resolveLocale(server: CommerceAIServer, catalogLocale?: string): string {
  return normalizeLocale(catalogLocale, server.supportedLocales, server.cartDefaults.catalogLocale);
}

/**
 * Cart currency and price-selection country. Without `cartPolicy` the body values win (legacy
 * behaviour). With it, a country outside `allowedCountries` falls back to `cartDefaults.country`
 * and the currency is `currencyByCountry[country]`, else `cartDefaults.currency`.
 */
export function resolvePriceScope(
  server: CommerceAIServer,
  body: { currency?: unknown; country?: unknown },
): { currency: string; country?: string } {
  const policy = server.cartPolicy;
  if (!policy) {
    return {
      currency: optionalString(body.currency) ?? server.cartDefaults.currency,
      country: optionalString(body.country) ?? server.cartDefaults.country,
    };
  }

  const defaultCountry = server.cartDefaults.country?.toUpperCase();
  let country = optionalString(body.country)?.toUpperCase() ?? defaultCountry;
  if (policy.allowedCountries?.length && (!country || !policy.allowedCountries.includes(country))) {
    country = defaultCountry;
  }
  const mapped = country ? policy.currencyByCountry?.[country] : undefined;
  return { currency: mapped ?? server.cartDefaults.currency, country };
}

export interface ResolvedCartIdentity {
  anonymousId?: string;
  customerId?: string;
}

/**
 * Customer identity from a session token (verified, then checked with `cartSession.isRevoked`),
 * else the guest anonymousId. Async because the revocation hook may be.
 */
export async function resolveCartIdentity(
  server: CommerceAIServer,
  sessionToken: unknown,
  anonymousId: unknown,
): Promise<ResolvedCartIdentity> {
  const token = optionalString(sessionToken);
  if (token) {
    const session = await authenticateCartSession(token, {
      secret: server.cartSessionSecret,
      isRevoked: server.cartSessionHooks?.isRevoked,
    });
    return { customerId: session.customerId };
  }

  return { anonymousId: requiredAnonymousId(anonymousId) };
}

export async function executeGetCart(
  server: CommerceAIServer,
  body: GetCartRequest,
): Promise<CartResponse> {
  const identity = await resolveCartIdentity(server, body.sessionToken, body.anonymousId);
  const locale = resolveLocale(server, body.catalogLocale);
  const cart = identity.customerId
    ? await server.commercetools.getCustomerCart(identity.customerId, locale)
    : await server.commercetools.getCart(identity.anonymousId ?? "", locale);
  return { cart };
}

export async function executeAddToCart(
  server: CommerceAIServer,
  body: AddToCartRequest,
): Promise<CartResponse> {
  const identity = await resolveCartIdentity(server, body.sessionToken, body.anonymousId);
  const sku = optionalString(body.sku);
  const productId = optionalString(body.productId);
  if (!sku && !productId) {
    throw new ValidationError("sku or productId is required");
  }

  const quantity = isAbsent(body.quantity)
    ? 1
    : parseQuantity(body.quantity, { min: 1, max: MAX_LINE_ITEM_QUANTITY });

  const cart = await server.commercetools.addToCart({
    anonymousId: identity.anonymousId,
    customerId: identity.customerId,
    sku,
    productId,
    variantId: body.variantId,
    quantity,
    ...resolvePriceScope(server, body),
    catalogLocale: resolveLocale(server, body.catalogLocale),
    cartId: optionalString(body.cartId),
  });

  return { cart };
}

export const MAX_ADD_ITEMS = 20;

export async function executeAddItemsToCart(
  server: CommerceAIServer,
  body: AddItemsToCartRequest,
): Promise<CartResponse> {
  const identity = await resolveCartIdentity(server, body.sessionToken, body.anonymousId);
  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw new ValidationError("items is required");
  }
  if (body.items.length > MAX_ADD_ITEMS) {
    throw new ValidationError(`items must not exceed ${MAX_ADD_ITEMS}`);
  }

  const items = body.items.map((item, index) => {
    const sku = optionalString(item.sku);
    const productId = optionalString(item.productId);
    if (!sku && !productId) {
      throw new ValidationError(`items[${index}]: sku or productId is required`);
    }
    let quantity = 1;
    if (!isAbsent(item.quantity)) {
      try {
        quantity = parseQuantity(item.quantity, { min: 1, max: MAX_LINE_ITEM_QUANTITY });
      } catch (error) {
        throw error instanceof ValidationError
          ? new ValidationError(`items[${index}]: ${error.message}`)
          : error;
      }
    }
    return {
      sku,
      productId,
      variantId: item.variantId,
      quantity,
    };
  });

  const cart = await server.commercetools.addItemsToCart({
    anonymousId: identity.anonymousId,
    customerId: identity.customerId,
    items,
    ...resolvePriceScope(server, body),
    catalogLocale: resolveLocale(server, body.catalogLocale),
    cartId: optionalString(body.cartId),
  });

  return { cart };
}

export async function executeRemoveFromCart(
  server: CommerceAIServer,
  body: CartMutationRequest,
): Promise<CartResponse> {
  const identity = await resolveCartIdentity(server, body.sessionToken, body.anonymousId);
  const lineItemId = requiredString(body.lineItemId, "lineItemId");

  const cart = await server.commercetools.removeLineItem({
    anonymousId: identity.anonymousId,
    customerId: identity.customerId,
    lineItemId,
    cartId: optionalString(body.cartId),
    catalogLocale: resolveLocale(server, body.catalogLocale),
  });

  return { cart };
}

export async function executeUpdateCartQuantity(
  server: CommerceAIServer,
  body: UpdateCartQuantityRequest,
): Promise<CartResponse> {
  const identity = await resolveCartIdentity(server, body.sessionToken, body.anonymousId);
  const lineItemId = requiredString(body.lineItemId, "lineItemId");
  // 0 removes the line item.
  const quantity = parseQuantity(body.quantity, { min: 0, max: MAX_LINE_ITEM_QUANTITY });

  const cart = await server.commercetools.changeLineItemQuantity({
    anonymousId: identity.anonymousId,
    customerId: identity.customerId,
    lineItemId,
    quantity,
    cartId: optionalString(body.cartId),
    catalogLocale: resolveLocale(server, body.catalogLocale),
  });

  return { cart };
}

export async function executeLogin(
  server: CommerceAIServer,
  body: CartLoginRequest,
): Promise<CartAuthResponse> {
  const email = requiredString(body.email, "email");
  const password = requiredString(body.password, "password");
  const locale = resolveLocale(server, body.catalogLocale);

  const result = await server.commercetools.loginAndMerge({
    email,
    password,
    anonymousId: optionalAnonymousId(body.anonymousId),
    cartId: optionalString(body.cartId),
    catalogLocale: locale,
  });

  const sessionToken = signCartSession({ customerId: result.customer.id }, server.cartSessionSecret);

  return {
    cart: result.cart,
    customer: result.customer,
    sessionToken,
  };
}

/**
 * Logout answers 200 `{ cart: null, customer: null }` whatever token it is given, with one
 * exception: an error thrown by a host hook (`cartSession.isRevoked` or `onLogout`) is not
 * swallowed and fails the request (500 `INTERNAL`). When a valid, unrevoked session token is
 * presented, `onLogout` receives its payload (for example to add it to a denylist). A missing,
 * invalid, expired or revoked token skips the hook.
 */
export async function executeLogout(
  server: CommerceAIServer,
  sessionToken?: unknown,
): Promise<CartAuthResponse> {
  const token = optionalString(sessionToken);
  const onLogout = server.cartSessionHooks?.onLogout;
  if (token && onLogout) {
    let session: CartSessionPayload | undefined;
    try {
      session = await authenticateCartSession(token, {
        secret: server.cartSessionSecret,
        isRevoked: server.cartSessionHooks?.isRevoked,
      });
    } catch (error) {
      if (!(error instanceof InvalidCartSessionError)) {
        throw error;
      }
    }
    if (session) {
      await onLogout(session);
    }
  }
  return { cart: null, customer: null };
}
