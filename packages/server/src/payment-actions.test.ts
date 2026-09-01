import type {
  CartSnapshot,
  CommercetoolsClient,
  SearchOrchestrator,
} from "@commerce-ai-tool/core";
import { PaymentDeclinedError } from "@commerce-ai-tool/core";
import { describe, expect, it, vi } from "vitest";
import { executeAuthorizePayment, executeGetPaymentMethods } from "./payment-actions.js";
import { ValidationError } from "./route-actions.js";
import type { CommerceAIServer } from "./server.js";

const cart: CartSnapshot = {
  id: "cart-1",
  version: 1,
  anonymousId: "anon-1",
  lineItems: [],
  totalPrice: { amount: 99, currency: "EUR", formatted: "€99.00" },
  totalQuantity: 0,
};

const payment = {
  id: "pay-1",
  paymentInterface: "MOCK",
  method: "CREDIT_CARD",
  status: "authorized" as const,
  amount: cart.totalPrice,
};

function server(): CommerceAIServer {
  return {
    orchestrator: {} as SearchOrchestrator,
    commercetools: {
      listPaymentMethods: vi.fn().mockResolvedValue([
        { method: "CREDIT_CARD", name: "Credit card" },
      ]),
      authorizePayment: vi.fn().mockResolvedValue({ payment, cart }),
    } as unknown as CommercetoolsClient,
    cartDefaults: { currency: "EUR", country: "DE", catalogLocale: "en" },
    cartSessionSecret: "test-secret",
    transcribeAudio: vi.fn(),
    synthesizeSpeech: vi.fn(),
  };
}

describe("payment-actions", () => {
  it("lists payment methods from the configured provider", async () => {
    const commerceServer = server();

    await expect(
      executeGetPaymentMethods(commerceServer, { anonymousId: "anon-1" }),
    ).resolves.toEqual({
      paymentMethods: [{ method: "CREDIT_CARD", name: "Credit card" }],
    });
    expect(commerceServer.commercetools.listPaymentMethods).toHaveBeenCalledWith({
      locale: "en",
      country: "DE",
    });
  });

  it("authorizes a payment method on the cart", async () => {
    const commerceServer = server();

    await expect(
      executeAuthorizePayment(commerceServer, {
        anonymousId: "anon-1",
        method: "CREDIT_CARD",
        orderNumber: "cat-1",
      }),
    ).resolves.toEqual({ payment, cart });
    expect(commerceServer.commercetools.authorizePayment).toHaveBeenCalledWith({
      anonymousId: "anon-1",
      customerId: undefined,
      cartId: undefined,
      catalogLocale: "en",
      method: "CREDIT_CARD",
      orderNumber: "cat-1",
    });
  });

  it("requires a payment method", async () => {
    await expect(
      executeAuthorizePayment(server(), { anonymousId: "anon-1", method: "  " }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("propagates PaymentDeclinedError", async () => {
    const commerceServer = server();
    vi.mocked(commerceServer.commercetools.authorizePayment).mockRejectedValue(
      new PaymentDeclinedError("Insufficient funds"),
    );

    await expect(
      executeAuthorizePayment(commerceServer, {
        anonymousId: "anon-1",
        method: "CREDIT_CARD",
      }),
    ).rejects.toBeInstanceOf(PaymentDeclinedError);
  });
});
