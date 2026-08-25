import type {
  CheckoutAddress,
  CheckoutRequest,
  CreateOrderRequest,
  OrderSnapshot,
  SetCartAddressesRequest,
  SetShippingMethodRequest,
  ShippingMethodSnapshot,
} from "@commerce-ai-tool/core";
import type { CommerceAIServer } from "./server.js";
import {
  optionalString,
  requiredString,
  resolveCartIdentity,
  resolveLocale,
} from "./cart-actions.js";
import { ValidationError } from "./route-actions.js";

export interface ShippingMethodsResponse {
  shippingMethods: ShippingMethodSnapshot[];
}

export interface OrderResponse {
  order: OrderSnapshot;
}

function parseAddress(value: unknown, field: string): CheckoutAddress {
  if (!value || typeof value !== "object") {
    throw new ValidationError(`${field} is required`);
  }
  const address = value as Record<string, unknown>;
  const country = requiredString(address.country, `${field}.country`).toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) {
    throw new ValidationError(`${field}.country must be an ISO 3166-1 alpha-2 code`);
  }

  return {
    firstName: requiredString(address.firstName, `${field}.firstName`),
    lastName: requiredString(address.lastName, `${field}.lastName`),
    streetName: requiredString(address.streetName, `${field}.streetName`),
    additionalStreetInfo: optionalString(address.additionalStreetInfo),
    postalCode: requiredString(address.postalCode, `${field}.postalCode`),
    city: requiredString(address.city, `${field}.city`),
    region: optionalString(address.region),
    country,
    email: optionalString(address.email),
    phone: optionalString(address.phone),
  };
}

function checkoutIdentity(
  server: CommerceAIServer,
  body: CheckoutRequest,
): CheckoutRequest {
  return {
    ...resolveCartIdentity(server, body.sessionToken, body.anonymousId),
    cartId: optionalString(body.cartId),
    catalogLocale: resolveLocale(server, body.catalogLocale),
  };
}

export async function executeSetCartAddresses(
  server: CommerceAIServer,
  body: SetCartAddressesRequest,
) {
  const cart = await server.commercetools.setCartAddresses({
    ...checkoutIdentity(server, body),
    shippingAddress: parseAddress(body.shippingAddress, "shippingAddress"),
    billingAddress: body.billingAddress
      ? parseAddress(body.billingAddress, "billingAddress")
      : undefined,
  });
  return { cart };
}

export async function executeGetShippingMethods(
  server: CommerceAIServer,
  body: CheckoutRequest,
): Promise<ShippingMethodsResponse> {
  const shippingMethods = await server.commercetools.getShippingMethods(
    checkoutIdentity(server, body),
  );
  return { shippingMethods };
}

export async function executeSetShippingMethod(
  server: CommerceAIServer,
  body: SetShippingMethodRequest,
) {
  const cart = await server.commercetools.setShippingMethod({
    ...checkoutIdentity(server, body),
    shippingMethodId: requiredString(body.shippingMethodId, "shippingMethodId"),
  });
  return { cart };
}

export async function executeCreateOrder(
  server: CommerceAIServer,
  body: CreateOrderRequest,
): Promise<OrderResponse> {
  const order = await server.commercetools.createOrder({
    ...checkoutIdentity(server, body),
    orderNumber: optionalString(body.orderNumber),
  });
  return { order };
}
