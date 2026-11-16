import type { GetOrderRequest, GetOrderResponse } from "@commerce-ai-tool/core";
import type { CommerceAIServer } from "./server.js";
import {
  optionalString,
  resolveCartIdentity,
  resolveLocale,
} from "./cart-actions.js";

export type { GetOrderResponse };

export async function executeGetOrder(
  server: CommerceAIServer,
  body: GetOrderRequest,
): Promise<GetOrderResponse> {
  const identity = await resolveCartIdentity(server, body.sessionToken, body.anonymousId);
  const catalogLocale = resolveLocale(server, optionalString(body.catalogLocale));
  // A customer session never widens the lookup with a client-supplied anonymousId: that id is a
  // bearer value, and pairing it with any valid session would expose another guest's orders.
  const anonymousId = identity.customerId ? undefined : identity.anonymousId;
  const orderNumber = optionalString(body.orderNumber);

  if (!orderNumber) {
    const orders = await server.commercetools.listOrders({
      anonymousId,
      customerId: identity.customerId,
      catalogLocale,
    });
    return { orders };
  }

  const order = await server.commercetools.getOrder({
    orderNumber,
    anonymousId,
    customerId: identity.customerId,
    catalogLocale,
  });
  return { order };
}
