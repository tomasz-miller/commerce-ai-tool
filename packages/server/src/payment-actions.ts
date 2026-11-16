import type {
  AuthorizePaymentRequest,
  AuthorizePaymentResponse,
  CheckoutRequest,
  PaymentMethodsResponse,
} from "@commerce-ai-tool/core";
import type { CommerceAIServer } from "./server.js";
import { optionalOrderNumber } from "./checkout-actions.js";
import {
  optionalString,
  requiredString,
  resolveCartIdentity,
  resolveLocale,
} from "./cart-actions.js";

export type { AuthorizePaymentResponse, PaymentMethodsResponse };

async function paymentIdentity(
  server: CommerceAIServer,
  body: CheckoutRequest,
): Promise<CheckoutRequest> {
  return {
    ...(await resolveCartIdentity(server, body.sessionToken, body.anonymousId)),
    cartId: optionalString(body.cartId),
    catalogLocale: resolveLocale(server, body.catalogLocale),
  };
}

export async function executeGetPaymentMethods(
  server: CommerceAIServer,
  body: CheckoutRequest,
): Promise<PaymentMethodsResponse> {
  const identity = await paymentIdentity(server, body);
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
    ...(await paymentIdentity(server, body)),
    method: requiredString(body.method, "method"),
    orderNumber: optionalOrderNumber(body.orderNumber),
  });
}
