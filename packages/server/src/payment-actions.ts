import type {
  AuthorizePaymentRequest,
  CartSnapshot,
  CheckoutRequest,
  PaymentMethodOption,
  PaymentSnapshot,
} from "@commerce-ai-tool/core";
import type { CommerceAIServer } from "./server.js";
import {
  optionalString,
  requiredString,
  resolveCartIdentity,
  resolveLocale,
} from "./cart-actions.js";

export interface PaymentMethodsResponse {
  paymentMethods: PaymentMethodOption[];
}

export interface AuthorizePaymentResponse {
  payment: PaymentSnapshot;
  cart: CartSnapshot;
}

function paymentIdentity(
  server: CommerceAIServer,
  body: CheckoutRequest,
): CheckoutRequest {
  return {
    ...resolveCartIdentity(server, body.sessionToken, body.anonymousId),
    cartId: optionalString(body.cartId),
    catalogLocale: resolveLocale(server, body.catalogLocale),
  };
}

export async function executeGetPaymentMethods(
  server: CommerceAIServer,
  body: CheckoutRequest,
): Promise<PaymentMethodsResponse> {
  const identity = paymentIdentity(server, body);
  const paymentMethods = await server.commercetools.listPaymentMethods({
    locale: identity.catalogLocale,
    country: server.cartDefaults.country,
  });
  return { paymentMethods };
}

export async function executeAuthorizePayment(
  server: CommerceAIServer,
  body: AuthorizePaymentRequest,
): Promise<AuthorizePaymentResponse> {
  return server.commercetools.authorizePayment({
    ...paymentIdentity(server, body),
    method: requiredString(body.method, "method"),
    orderNumber: optionalString(body.orderNumber),
  });
}
