import cors from "cors";
import type { Express, RequestHandler, Response } from "express";
import { Router } from "express";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import type { CommerceAIConfig } from "@commerce-ai-tool/core";
import { createHandlers } from "./handlers.js";
import type { HandlerResponse } from "./handler-response.js";
import {
  LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
  LOGIN_RATE_LIMIT_MESSAGE,
  LOGIN_RATE_LIMIT_WINDOW_MS,
  ORDER_RATE_LIMIT_MAX_ATTEMPTS,
  ORDER_RATE_LIMIT_MESSAGE,
  ORDER_RATE_LIMIT_WINDOW_MS,
} from "./login-rate-limit.js";
import { createCommerceAIServer } from "./server.js";

export interface ExpressRouterOptions {
  config: CommerceAIConfig;
  basePath?: string;
  corsOrigins?: string | string[];
  /**
   * Rate limit for `POST /cart/login`. Defaults to 10 attempts / 15 minutes per IP.
   * Set `false` only when an upstream gateway already throttles this route.
   */
  loginRateLimit?: false | { windowMs?: number; limit?: number };
  /**
   * Rate limit for `POST /cart/order`. Defaults to 20 attempts / 15 minutes per IP.
   * Set `false` only when an upstream gateway already throttles this route.
   */
  orderRateLimit?: false | { windowMs?: number; limit?: number };
}

export function createExpressRouter(options: ExpressRouterOptions): Router {
  const { config, basePath = "", corsOrigins, loginRateLimit, orderRateLimit } = options;
  const server = createCommerceAIServer({ config, corsOrigins });
  const handlers = createHandlers(server);
  const router = Router();
  const loginLimiter = createRateLimitMiddleware(loginRateLimit, {
    windowMs: LOGIN_RATE_LIMIT_WINDOW_MS,
    limit: LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
    message: LOGIN_RATE_LIMIT_MESSAGE,
  });
  const orderLimiter = createRateLimitMiddleware(orderRateLimit, {
    windowMs: ORDER_RATE_LIMIT_WINDOW_MS,
    limit: ORDER_RATE_LIMIT_MAX_ATTEMPTS,
    message: ORDER_RATE_LIMIT_MESSAGE,
  });

  if (corsOrigins) {
    router.use(cors({ origin: corsOrigins }));
  }

  router.get(`${basePath}/health`, async (_req, res) => {
    const response = await handlers.health();
    sendHandlerResponse(res, response);
  });

  router.post(`${basePath}/search`, async (req, res) => {
    const response = await handlers.search(req);
    sendHandlerResponse(res, response);
  });

  router.get(`${basePath}/search/facet-schema`, async (_req, res) => {
    const response = await handlers.facetSchema();
    sendHandlerResponse(res, response);
  });

  router.post(`${basePath}/search/suggestions`, async (req, res) => {
    const response = await handlers.searchSuggestions(req);
    sendHandlerResponse(res, response);
  });

  router.post(`${basePath}/search/voice`, async (req, res) => {
    const response = await handlers.searchVoice(req);
    sendHandlerResponse(res, response);
  });

  router.post(`${basePath}/search/image`, async (req, res) => {
    const response = await handlers.searchImage(req);
    sendHandlerResponse(res, response);
  });

  router.post(`${basePath}/tts`, async (req, res) => {
    const response = await handlers.tts(req);
    sendHandlerResponse(res, response);
  });

  router.get(`${basePath}/cart`, async (req, res) => {
    const response = await handlers.getCart(req);
    sendHandlerResponse(res, response);
  });

  router.post(`${basePath}/cart/add`, async (req, res) => {
    const response = await handlers.addToCart(req);
    sendHandlerResponse(res, response);
  });

  router.post(`${basePath}/cart/remove`, async (req, res) => {
    const response = await handlers.removeFromCart(req);
    sendHandlerResponse(res, response);
  });

  router.post(`${basePath}/cart/update-quantity`, async (req, res) => {
    const response = await handlers.updateCartQuantity(req);
    sendHandlerResponse(res, response);
  });

  router.post(`${basePath}/cart/addresses`, async (req, res) => {
    const response = await handlers.setCartAddresses(req);
    sendHandlerResponse(res, response);
  });

  router.get(`${basePath}/cart/shipping-methods`, async (req, res) => {
    const response = await handlers.getShippingMethods(req);
    sendHandlerResponse(res, response);
  });

  router.post(`${basePath}/cart/shipping-method`, async (req, res) => {
    const response = await handlers.setShippingMethod(req);
    sendHandlerResponse(res, response);
  });

  router.post(`${basePath}/cart/order`, orderLimiter, async (req, res) => {
    const response = await handlers.createOrder(req);
    sendHandlerResponse(res, response);
  });

  router.post(`${basePath}/cart/login`, loginLimiter, async (req, res) => {
    const response = await handlers.login(req);
    sendHandlerResponse(res, response);
  });

  router.post(`${basePath}/cart/logout`, async (_req, res) => {
    const response = await handlers.logout();
    sendHandlerResponse(res, response);
  });

  return router;
}

export function mountCommerceAIRoutes(app: Express, options: ExpressRouterOptions): void {
  app.use(createExpressRouter(options));
}

function createRateLimitMiddleware(
  options: false | { windowMs?: number; limit?: number } | undefined,
  defaults: { windowMs: number; limit: number; message: string },
): RequestHandler {
  if (options === false) {
    return (_req, _res, next) => next();
  }

  const windowMs = options?.windowMs ?? defaults.windowMs;

  return rateLimit({
    windowMs,
    limit: options?.limit ?? defaults.limit,
    standardHeaders: true,
    legacyHeaders: false,
    // Library hosts may not set `trust proxy`. Use the socket address instead of
    // throwing on an unexpected X-Forwarded-For header.
    validate: { xForwardedForHeader: false },
    keyGenerator: (req) => ipKeyGenerator(req.ip || req.socket.remoteAddress || "127.0.0.1"),
    handler: (_req, res) => {
      res.setHeader("Retry-After", String(Math.ceil(windowMs / 1000)));
      res.status(429).json({ error: defaults.message });
    },
  });
}

function sendHandlerResponse(
  res: Response,
  handlerResponse: HandlerResponse,
): void {
  if (handlerResponse.headers) {
    for (const [key, value] of Object.entries(handlerResponse.headers)) {
      res.setHeader(key, value);
    }
  }

  res.status(handlerResponse.status).send(handlerResponse.body);
}
