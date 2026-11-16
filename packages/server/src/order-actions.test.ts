import type {
  CommercetoolsClient,
  OrderSnapshot,
  SearchOrchestrator,
} from "@commerce-ai-tool/core";
import { OrderNotFoundError } from "@commerce-ai-tool/core";
import { describe, expect, it, vi } from "vitest";
import { executeGetOrder } from "./order-actions.js";
import { InvalidCartSessionError, signCartSession } from "./cart-session.js";
import type { CommerceAIServer } from "./server.js";

const order: OrderSnapshot = {
  id: "order-1",
  orderNumber: "cat-1",
  orderState: "Open",
  totalPrice: { amount: 99, currency: "EUR", formatted: "€99.00" },
  lineItems: [],
};

function server(): CommerceAIServer {
  return {
    orchestrator: {} as SearchOrchestrator,
    commercetools: {
      getOrder: vi.fn().mockResolvedValue(order),
      listOrders: vi.fn().mockResolvedValue([order]),
    } as unknown as CommercetoolsClient,
    cartDefaults: { currency: "EUR", country: "DE", catalogLocale: "en" },
    cartSessionSecret: "test-secret",
    transcribeAudio: vi.fn(),
    synthesizeSpeech: vi.fn(),
  };
}

describe("order-actions", () => {
  it("loads an order for the current anonymous identity", async () => {
    const commerceServer = server();

    await expect(
      executeGetOrder(commerceServer, {
        anonymousId: "anon-1",
        orderNumber: "cat-1",
      }),
    ).resolves.toEqual({ order });
    expect(commerceServer.commercetools.getOrder).toHaveBeenCalledWith({
      orderNumber: "cat-1",
      anonymousId: "anon-1",
      customerId: undefined,
      catalogLocale: "en",
    });
  });

  it("ignores body anonymousId when a session token resolves to a customer", async () => {
    const commerceServer = server();
    const sessionToken = signCartSession({ customerId: "cust-1" }, "test-secret");

    await executeGetOrder(commerceServer, {
      sessionToken,
      anonymousId: "someone-elses-anon",
      orderNumber: "cat-1",
    });
    await executeGetOrder(commerceServer, { sessionToken, anonymousId: "x".repeat(500) });

    expect(commerceServer.commercetools.getOrder).toHaveBeenCalledWith({
      orderNumber: "cat-1",
      anonymousId: undefined,
      customerId: "cust-1",
      catalogLocale: "en",
    });
    expect(commerceServer.commercetools.listOrders).toHaveBeenCalledWith({
      anonymousId: undefined,
      customerId: "cust-1",
      catalogLocale: "en",
    });
  });

  it("lists session orders when no order number is provided", async () => {
    const commerceServer = server();

    await expect(
      executeGetOrder(commerceServer, {
        anonymousId: "anon-1",
      }),
    ).resolves.toEqual({ orders: [order] });
    expect(commerceServer.commercetools.listOrders).toHaveBeenCalledWith({
      anonymousId: "anon-1",
      customerId: undefined,
      catalogLocale: "en",
    });
    expect(commerceServer.commercetools.getOrder).not.toHaveBeenCalled();
  });

  it("maps a missing order to OrderNotFoundError", async () => {
    const commerceServer = server();
    vi.mocked(commerceServer.commercetools.getOrder).mockRejectedValue(new OrderNotFoundError());

    await expect(
      executeGetOrder(commerceServer, {
        anonymousId: "anon-1",
        orderNumber: "missing",
      }),
    ).rejects.toBeInstanceOf(OrderNotFoundError);
  });

  it("rejects a revoked session before reading orders", async () => {
    const sessionToken = signCartSession({ customerId: "cust-1" }, "test-secret");
    const revoked = { ...server(), cartSessionHooks: { isRevoked: async () => true } };

    await expect(
      executeGetOrder(revoked, { sessionToken, orderNumber: "cat-1" }),
    ).rejects.toBeInstanceOf(InvalidCartSessionError);
    expect(revoked.commercetools.getOrder).not.toHaveBeenCalled();
  });
});
