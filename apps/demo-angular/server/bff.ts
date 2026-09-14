import express, { type Express } from "express";
import { loadConfigFromEnv } from "@commerce-ai-tool/server";
import { createExpressRouter } from "@commerce-ai-tool/server/express";
import { createMockPaymentProvider } from "./mock-payment-provider.js";

export const DEMO_BFF_BASE_PATH = "/api/commerce-ai";
export const DEMO_BFF_DEFAULT_PORT = 3002;
export const DEMO_BFF_DEFAULT_HOST = "127.0.0.1";
export const DEMO_UI_ORIGIN = "http://localhost:4200";

export function resolveBffPort(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number.parseInt(env.BFF_PORT ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEMO_BFF_DEFAULT_PORT;
}

export function resolveBffHost(env: NodeJS.ProcessEnv = process.env): string {
  const host = env.BFF_HOST?.trim();
  return host && host.length > 0 ? host : DEMO_BFF_DEFAULT_HOST;
}

export function createDemoBffApp(): Express {
  const config = loadConfigFromEnv();
  const app = express();
  app.disable("x-powered-by");
  app.use(
    createExpressRouter({
      config: {
        ...config,
        payments: {
          ...config.payments,
          provider: createMockPaymentProvider(),
        },
      },
      basePath: DEMO_BFF_BASE_PATH,
      corsOrigins: DEMO_UI_ORIGIN,
    }),
  );
  return app;
}
