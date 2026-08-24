import cors from "cors";
import type { Express, Response } from "express";
import { Router } from "express";
import type { CommerceAIConfig } from "@commerce-ai-tool/core";
import { createHandlers } from "./handlers.js";
import { createCommerceAIServer } from "./server.js";

export interface ExpressRouterOptions {
  config: CommerceAIConfig;
  basePath?: string;
  corsOrigins?: string | string[];
}

export function createExpressRouter(options: ExpressRouterOptions): Router {
  const { config, basePath = "", corsOrigins } = options;
  const server = createCommerceAIServer({ config, corsOrigins });
  const handlers = createHandlers(server);
  const router = Router();

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

  router.post(`${basePath}/cart/login`, async (req, res) => {
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

import type { HandlerResponse } from "./handler-response.js";

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
