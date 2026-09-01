import type { GetOrderRequest, OrderSnapshot } from "@commerce-ai-tool/core";
import type { CommerceAIServer } from "./server.js";
import {
  optionalString,
  resolveCartIdentity,
  resolveLocale,
} from "./cart-actions.js";

export interface GetOrderResponse {
  order?: OrderSnapshot;
  orders?: OrderSnapshot[];
}

export async function executeGetOrder(
  server: CommerceAIServer,
  body: GetOrderRequest,
): Promise<GetOrderResponse> {
  const identity = resolveCartIdentity(server, body.sessionToken, body.anonymousId);
  const catalogLocale = resolveLocale(server, optionalString(body.catalogLocale));
  const anonymousId = identity.anonymousId ?? optionalString(body.anonymousId);
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
