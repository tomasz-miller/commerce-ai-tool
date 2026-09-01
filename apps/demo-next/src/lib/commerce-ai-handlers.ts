import { createNextHandlers, loadConfigFromEnv } from "@commerce-ai-tool/server";
import type { NextHandlers } from "@commerce-ai-tool/server";
import { createMockPaymentProvider } from "./mock-payment-provider";

let handlers: NextHandlers | null = null;

export function getCommerceAIHandlers(): NextHandlers {
  if (!handlers) {
    const config = loadConfigFromEnv();
    handlers = createNextHandlers({
      ...config,
      payments: {
        ...config.payments,
        provider: createMockPaymentProvider(),
      },
    });
  }
  return handlers;
}
