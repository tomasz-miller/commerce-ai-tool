import {
  createNextHandlers,
  createNextRouteHandler,
  loadConfigFromEnv,
} from "@commerce-ai-tool/server";
import type { NextHandlers, NextRouteHandler } from "@commerce-ai-tool/server";
import { after } from "next/server";
import { createMockPaymentProvider } from "./mock-payment-provider";

function buildConfig(): ReturnType<typeof loadConfigFromEnv> {
  const config = loadConfigFromEnv();
  // The mock provider authorizes every payment: opt in explicitly (CAT_DEMO_MOCK_PAYMENTS=true).
  return process.env.CAT_DEMO_MOCK_PAYMENTS === "true"
    ? {
        ...config,
        payments: {
          ...config.payments,
          provider: createMockPaymentProvider(),
        },
      }
    : config;
}

// Run the Langfuse flush after the response is sent instead of before it.
const options = { defer: after };

let route: NextRouteHandler | null = null;

/** The catch-all handler behind `app/api/commerce-ai/[...path]/route.ts`. Created once per process. */
export function getCommerceAIRoute(): NextRouteHandler {
  route ??= createNextRouteHandler(buildConfig, options);
  return route;
}

let handlers: NextHandlers | null = null;

/** Per-route functions, used only by the optional per-route example in `health/route.ts`. */
export function getCommerceAIHandlers(): NextHandlers {
  handlers ??= createNextHandlers(buildConfig(), options);
  return handlers;
}
