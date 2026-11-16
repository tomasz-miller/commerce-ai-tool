import express, { type Express, type RequestHandler } from "express";
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

export const DEMO_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Content-Security-Policy": "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  "Permissions-Policy": "microphone=(self), camera=(self)",
};

export function securityHeaders(): RequestHandler {
  return (_req, res, next) => {
    for (const [name, value] of Object.entries(DEMO_SECURITY_HEADERS)) {
      res.setHeader(name, value);
    }
    next();
  };
}

// The mock provider authorizes every payment: opt in explicitly (CAT_DEMO_MOCK_PAYMENTS=true).
export function isMockPaymentsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CAT_DEMO_MOCK_PAYMENTS === "true";
}

export function createDemoBffApp(): Express {
  const config = loadConfigFromEnv();
  const app = express();
  app.disable("x-powered-by");
  app.use(securityHeaders());
  app.use(
    createExpressRouter({
      config: isMockPaymentsEnabled()
        ? {
            ...config,
            payments: {
              ...config.payments,
              provider: createMockPaymentProvider(),
            },
          }
        : config,
      basePath: DEMO_BFF_BASE_PATH,
      corsOrigins: DEMO_UI_ORIGIN,
    }),
  );
  return app;
}
