import type {
  AddToCartRequest,
  CartMutationRequest,
  CartSnapshot,
  GetCartRequest,
  UpdateCartQuantityRequest,
} from "@commerce-ai-tool/core";
import type { CommerceAIServer } from "./server.js";
import { ValidationError } from "./route-actions.js";

export interface CartResponse {
  cart: CartSnapshot | null;
}

export const ANONYMOUS_ID_MAX_LENGTH = 128;

function requiredAnonymousId(value: unknown): string {
  const anonymousId = requiredString(value, "anonymousId");
  if (anonymousId.length > ANONYMOUS_ID_MAX_LENGTH) {
    throw new ValidationError("anonymousId is too long");
  }
  return anonymousId;
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

export async function executeGetCart(
  server: CommerceAIServer,
  body: GetCartRequest,
): Promise<CartResponse> {
  const anonymousId = requiredAnonymousId(body.anonymousId);
  const cart = await server.commercetools.getCart(
    anonymousId,
    resolveLocale(server, body.catalogLocale),
  );
  return { cart };
}

export async function executeAddToCart(
  server: CommerceAIServer,
  body: AddToCartRequest,
): Promise<CartResponse> {
  const anonymousId = requiredAnonymousId(body.anonymousId);
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
    anonymousId,
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
  const anonymousId = requiredAnonymousId(body.anonymousId);
  const lineItemId = requiredString(body.lineItemId, "lineItemId");

  const cart = await server.commercetools.removeLineItem({
    anonymousId,
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
  const anonymousId = requiredAnonymousId(body.anonymousId);
  const lineItemId = requiredString(body.lineItemId, "lineItemId");
  const quantity = optionalNumber(body.quantity);
  if (quantity === undefined || quantity < 0) {
    throw new ValidationError("quantity must be a non-negative number");
  }

  const cart = await server.commercetools.changeLineItemQuantity({
    anonymousId,
    lineItemId,
    quantity,
    cartId: optionalString(body.cartId),
    cartVersion: body.cartVersion,
    catalogLocale: resolveLocale(server, body.catalogLocale),
  });

  return { cart };
}
