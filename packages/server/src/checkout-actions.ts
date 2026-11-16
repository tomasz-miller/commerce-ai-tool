import { ORDER_NUMBER_PATTERN } from "@commerce-ai-tool/core";
import type {
  CheckoutAddress,
  CheckoutRequest,
  CreateOrderRequest,
  OrderResponse,
  SetCartAddressesRequest,
  SetShippingMethodRequest,
  ShippingMethodsResponse,
} from "@commerce-ai-tool/core";
import type { CommerceAIServer } from "./server.js";
import {
  optionalString,
  requiredString,
  resolveCartIdentity,
  resolveLocale,
} from "./cart-actions.js";
import { ValidationError } from "./errors.js";

export type { OrderResponse, ShippingMethodsResponse };

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

/** `orderNumber` becomes the Order number and part of the Payment key: `cat-<uuid>` only. */
export function optionalOrderNumber(value: unknown): string | undefined {
  const orderNumber = optionalString(value);
  if (orderNumber !== undefined && !ORDER_NUMBER_PATTERN.test(orderNumber)) {
    throw new ValidationError("orderNumber is invalid");
  }
  return orderNumber;
}

function assertShippingCountryAllowed(server: CommerceAIServer, country: string): void {
  const allowed = server.cartPolicy?.allowedCountries;
  if (allowed?.length && !allowed.includes(country)) {
    throw new ValidationError("shippingAddress.country is not supported");
  }
}

async function checkoutIdentity(
  server: CommerceAIServer,
  body: CheckoutRequest,
): Promise<CheckoutRequest> {
  return {
    ...(await resolveCartIdentity(server, body.sessionToken, body.anonymousId)),
    cartId: optionalString(body.cartId),
    catalogLocale: resolveLocale(server, body.catalogLocale),
  };
}

export async function executeSetCartAddresses(
  server: CommerceAIServer,
  body: SetCartAddressesRequest,
) {
  const identity = await checkoutIdentity(server, body);
  const shippingAddress = parseAddress(body.shippingAddress, "shippingAddress");
  assertShippingCountryAllowed(server, shippingAddress.country);
  const cart = await server.commercetools.setCartAddresses({
    ...identity,
    shippingAddress,
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
    await checkoutIdentity(server, body),
  );
  return { shippingMethods };
}

export async function executeSetShippingMethod(
  server: CommerceAIServer,
  body: SetShippingMethodRequest,
) {
  const cart = await server.commercetools.setShippingMethod({
    ...(await checkoutIdentity(server, body)),
    shippingMethodId: requiredString(body.shippingMethodId, "shippingMethodId"),
  });
  return { cart };
}

export async function executeCreateOrder(
  server: CommerceAIServer,
  body: CreateOrderRequest,
): Promise<OrderResponse> {
  const order = await server.commercetools.createOrder({
    ...(await checkoutIdentity(server, body)),
    orderNumber: optionalOrderNumber(body.orderNumber),
  });
  return { order };
}
