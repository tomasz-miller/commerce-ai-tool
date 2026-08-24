import type {
  AddToCartRequest,
  CartLoginRequest,
  CartMutationRequest,
  CartSnapshot,
  CustomerSnapshot,
  GetCartRequest,
  UpdateCartQuantityRequest,
} from "@commerce-ai-tool/core";
import type { CommerceAIServer } from "./server.js";
import { ValidationError } from "./route-actions.js";
import { signCartSession, verifyCartSession } from "./cart-session.js";

export interface CartResponse {
  cart: CartSnapshot | null;
}

export interface CartAuthResponse extends CartResponse {
  customer: CustomerSnapshot | null;
  sessionToken?: string;
}

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

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ValidationError(`${field} is required`);
  }
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new ValidationError("quantity must be a number");
  }
  return parsed;
}

function resolveLocale(server: CommerceAIServer, catalogLocale?: string): string {
  return catalogLocale?.trim() || server.cartDefaults.catalogLocale;
}

interface ResolvedCartIdentity {
  anonymousId?: string;
  customerId?: string;
}

function resolveCartIdentity(
  server: CommerceAIServer,
  sessionToken: unknown,
  anonymousId: unknown,
): ResolvedCartIdentity {
  const token = optionalString(sessionToken);
  if (token) {
    const session = verifyCartSession(token, server.cartSessionSecret);
    return { customerId: session.customerId };
  }

  return { anonymousId: requiredAnonymousId(anonymousId) };
}

export async function executeGetCart(
  server: CommerceAIServer,
  body: GetCartRequest,
): Promise<CartResponse> {
  const identity = resolveCartIdentity(server, body.sessionToken, body.anonymousId);
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
  const identity = resolveCartIdentity(server, body.sessionToken, body.anonymousId);
  const sku = optionalString(body.sku);
  const productId = optionalString(body.productId);
  if (!sku && !productId) {
    throw new ValidationError("sku or productId is required");
  }

  const quantity = optionalNumber(body.quantity) ?? 1;
  if (quantity < 1) {
    throw new ValidationError("quantity must be at least 1");
  }

  const cart = await server.commercetools.addToCart({
    anonymousId: identity.anonymousId,
    customerId: identity.customerId,
    sku,
    productId,
    variantId: body.variantId,
    quantity,
    currency: optionalString(body.currency) ?? server.cartDefaults.currency,
    country: optionalString(body.country) ?? server.cartDefaults.country,
    catalogLocale: resolveLocale(server, body.catalogLocale),
    cartId: optionalString(body.cartId),
  });

  return { cart };
}

export async function executeRemoveFromCart(
  server: CommerceAIServer,
  body: CartMutationRequest,
): Promise<CartResponse> {
  const identity = resolveCartIdentity(server, body.sessionToken, body.anonymousId);
  const lineItemId = requiredString(body.lineItemId, "lineItemId");

  const cart = await server.commercetools.removeLineItem({
    anonymousId: identity.anonymousId,
    customerId: identity.customerId,
    lineItemId,
    cartId: optionalString(body.cartId),
    cartVersion: body.cartVersion,
    catalogLocale: resolveLocale(server, body.catalogLocale),
  });

  return { cart };
}

export async function executeUpdateCartQuantity(
  server: CommerceAIServer,
  body: UpdateCartQuantityRequest,
): Promise<CartResponse> {
  const identity = resolveCartIdentity(server, body.sessionToken, body.anonymousId);
  const lineItemId = requiredString(body.lineItemId, "lineItemId");
  const quantity = optionalNumber(body.quantity);
  if (quantity === undefined || quantity < 0) {
    throw new ValidationError("quantity must be a non-negative number");
  }

  const cart = await server.commercetools.changeLineItemQuantity({
    anonymousId: identity.anonymousId,
    customerId: identity.customerId,
    lineItemId,
    quantity,
    cartId: optionalString(body.cartId),
    cartVersion: body.cartVersion,
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

  const sessionToken = signCartSession(
    { customerId: result.customer.id, email: result.customer.email },
    server.cartSessionSecret,
  );

  return {
    cart: result.cart,
    customer: result.customer,
    sessionToken,
  };
}

export async function executeLogout(): Promise<CartAuthResponse> {
  return { cart: null, customer: null };
}
