import type { PaymentProvider } from "@commerce-ai-tool/core";

/** Demo-only adapter. Host apps should inject a real PSP implementation. */
export function createMockPaymentProvider(): PaymentProvider {
  return {
    paymentInterface: "MOCK",
    async listMethods() {
      return [
        {
          method: "CREDIT_CARD",
          name: "Credit card",
          description: "Demo authorization — no real charge",
        },
      ];
    },
    async authorize(request) {
      if (request.amount.centAmount === 1313) {
        return {
          status: "failed",
          failureReason: "Insufficient funds",
        };
      }
      return {
        status: "authorized",
        interfaceId: `mock-${request.orderNumber}`,
      };
    },
  };
}
