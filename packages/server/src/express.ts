import { isIP } from "node:net";
import cors from "cors";
import type { Express, Request, RequestHandler, Response } from "express";
import { Router } from "express";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import type { ApiErrorBody, CommerceAIConfig } from "@commerce-ai-tool/core";
import { createHandlers } from "./handlers.js";
import type { HandlerResponse } from "./handler-response.js";
import type { FlushDefer } from "./observability/flush.js";
import {
  COMMERCE_AI_ROUTES,
  invokeRoute,
  rejectUnsupportedContentType,
  type RouteBucket,
  type RouteDefinition,
} from "./routes.js";
import {
  AI_RATE_LIMIT_MAX_REQUESTS,
  AI_RATE_LIMIT_MESSAGE,
  AI_RATE_LIMIT_WINDOW_MS,
  createFixedWindowLimiter,
  LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
  LOGIN_RATE_LIMIT_MESSAGE,
  LOGIN_RATE_LIMIT_WINDOW_MS,
  ORDER_RATE_LIMIT_MAX_ATTEMPTS,
  ORDER_RATE_LIMIT_MESSAGE,
  ORDER_RATE_LIMIT_WINDOW_MS,
  PAYMENT_RATE_LIMIT_MAX_ATTEMPTS,
  PAYMENT_RATE_LIMIT_MESSAGE,
  PAYMENT_RATE_LIMIT_WINDOW_MS,
  SUGGESTIONS_RATE_LIMIT_MAX_REQUESTS,
  type RateLimitOption,
} from "./rate-limit.js";
import { createCommerceAIServer } from "./server.js";

export interface ExpressRouterOptions {
  config: CommerceAIConfig;
  basePath?: string;
  corsOrigins?: string | string[];
  /**
   * Rate limit for the AI routes. Defaults to 30 requests / minute per client, shared by
   * `/search`, `/search/voice`, `/search/image` and `/tts`. `/search/suggestions` has its own
   * bucket (see `suggestionsRateLimit`). `false` disables both (only when an upstream gateway
   * already throttles these routes).
   */
  aiRateLimit?: RateLimitOption;
  /**
   * Rate limit for `/search/suggestions`, which can make an AI call per request. Defaults to
   * 120 requests / minute per client in its own bucket; `aiRateLimit` does not change it. `false`
   * disables it, and so does `aiRateLimit: false`.
   */
  suggestionsRateLimit?: RateLimitOption;
  /**
   * Rate limit for `POST /cart/login`. Defaults to 10 attempts / 15 minutes per client and,
   * separately, 10 failed logins / 15 minutes per email address (SHA-256 hashed); an exhausted
   * email is rejected before the attempt. Both must pass.
   * Set `false` only when an upstream gateway already throttles this route.
   */
  loginRateLimit?: RateLimitOption;
  /**
   * Rate limit for `POST /cart/order`. Defaults to 20 attempts / 15 minutes per client.
   * Set `false` only when an upstream gateway already throttles this route.
   */
  orderRateLimit?: RateLimitOption;
  /**
   * Rate limit for `POST /cart/payment`. Defaults to 20 attempts / 15 minutes per client.
   * Set `false` only when an upstream gateway already throttles this route.
   */
  paymentRateLimit?: RateLimitOption;
  /**
   * Client key for every limiter. Defaults to express-rate-limit's key generator: `req.ip`
   * with IPv6 addresses masked to a /56 subnet, plus its proxy misconfiguration checks.
   * Behind a reverse proxy, set `app.set("trust proxy", <number of proxies>)` so `req.ip` is
   * the client address. Keys returned here that are IP addresses are masked with
   * `ipKeyGenerator` (IPv6 /56); other keys are used as-is.
   */
  keyGenerator?: (req: Request) => string;
}

export function createExpressRouter(options: ExpressRouterOptions): Router {
  const {
    config,
    basePath = "",
    corsOrigins,
    aiRateLimit,
    suggestionsRateLimit,
    loginRateLimit,
    orderRateLimit,
    paymentRateLimit,
    keyGenerator,
  } = options;
  const server = createCommerceAIServer({ config, corsOrigins });
  const handlers = createHandlers(server, {
    loginEmailLimiter:
      loginRateLimit === false
        ? undefined
        : createFixedWindowLimiter({
            windowMs: loginRateLimit?.windowMs ?? LOGIN_RATE_LIMIT_WINDOW_MS,
            limit: loginRateLimit?.limit ?? LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
            message: LOGIN_RATE_LIMIT_MESSAGE,
          }),
  });
  const router = Router();
  const aiLimiter = createRateLimitMiddleware(
    aiRateLimit,
    {
      windowMs: AI_RATE_LIMIT_WINDOW_MS,
      limit: AI_RATE_LIMIT_MAX_REQUESTS,
      message: AI_RATE_LIMIT_MESSAGE,
    },
    keyGenerator,
  );
  const suggestionsLimiter = createRateLimitMiddleware(
    aiRateLimit === false ? false : suggestionsRateLimit,
    {
      windowMs: AI_RATE_LIMIT_WINDOW_MS,
      limit: SUGGESTIONS_RATE_LIMIT_MAX_REQUESTS,
      message: AI_RATE_LIMIT_MESSAGE,
    },
    keyGenerator,
  );
  const loginLimiter = createRateLimitMiddleware(
    loginRateLimit,
    {
      windowMs: LOGIN_RATE_LIMIT_WINDOW_MS,
      limit: LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
      message: LOGIN_RATE_LIMIT_MESSAGE,
    },
    keyGenerator,
  );
  const orderLimiter = createRateLimitMiddleware(
    orderRateLimit,
    {
      windowMs: ORDER_RATE_LIMIT_WINDOW_MS,
      limit: ORDER_RATE_LIMIT_MAX_ATTEMPTS,
      message: ORDER_RATE_LIMIT_MESSAGE,
    },
    keyGenerator,
  );
  const paymentLimiter = createRateLimitMiddleware(
    paymentRateLimit,
    {
      windowMs: PAYMENT_RATE_LIMIT_WINDOW_MS,
      limit: PAYMENT_RATE_LIMIT_MAX_ATTEMPTS,
      message: PAYMENT_RATE_LIMIT_MESSAGE,
    },
    keyGenerator,
  );

  if (corsOrigins) {
    router.use(cors({ origin: corsOrigins }));
  }

  const limiters: Record<RouteBucket, RequestHandler> = {
    ai: aiLimiter,
    suggestions: suggestionsLimiter,
    login: loginLimiter,
    order: orderLimiter,
    payment: paymentLimiter,
  };

  for (const route of COMMERCE_AI_ROUTES) {
    const middleware: RequestHandler[] = [];
    if (route.bucket) {
      middleware.push(limiters[route.bucket]);
    }
    if (route.body === "json") {
      middleware.push(requireJson(route));
    }

    const register = route.method === "GET" ? router.get.bind(router) : router.post.bind(router);
    register(`${basePath}${route.path}`, ...middleware, async (req, res) => {
      const response = await invokeRoute(
        handlers,
        route,
        req,
        route.requestContext
          ? { defer: deferUntilResponseEnds(res), signal: abortOnClientClose(res) }
          : undefined,
      );
      sendHandlerResponse(res, response);
    });
  }

  return router;
}

export function mountCommerceAIRoutes(app: Express, options: ExpressRouterOptions): void {
  app.use(createExpressRouter(options));
}

/** JSON POST routes reject other media types (415). Multipart and GET routes do not use this. */
function requireJson(route: RouteDefinition): RequestHandler {
  return (req, res, next) => {
    const rejected = rejectUnsupportedContentType(route, req.headers["content-type"]);
    if (rejected) {
      sendHandlerResponse(res, rejected);
      return;
    }
    next();
  };
}

/** Masks IP-address keys from a host key generator so IPv6 clients cannot rotate addresses. */
function maskIpKeys(keyGenerator: (req: Request) => string): (req: Request) => string {
  return (req) => {
    const key = keyGenerator(req);
    return isIP(key) ? ipKeyGenerator(key) : key;
  };
}

function createRateLimitMiddleware(
  options: RateLimitOption | undefined,
  defaults: { windowMs: number; limit: number; message: string },
  keyGenerator?: (req: Request) => string,
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
    // Without a host key generator, express-rate-limit's default runs: it keys on `req.ip`
    // (IPv6 masked to /56) and logs ERR_ERL_UNEXPECTED_X_FORWARDED_FOR when `trust proxy`
    // is not set behind a proxy.
    ...(keyGenerator ? { keyGenerator: maskIpKeys(keyGenerator) } : {}),
    handler: (_req, res) => {
      res.setHeader("Retry-After", String(Math.ceil(windowMs / 1000)));
      const body: ApiErrorBody = { error: defaults.message, code: "RATE_LIMITED" };
      res.status(429).json(body);
    },
  });
}

/**
 * Binds the Langfuse flush to this response: it runs once the response has been flushed to the
 * socket (`finish`), or the connection closed first (`close`), so it never delays the reply.
 * The flush is scheduled after the AI work, so the response may already have ended (for example
 * the client aborted meanwhile, and `close` has fired); then it runs immediately.
 */
function deferUntilResponseEnds(res: Response): FlushDefer {
  return (fn) => {
    let started = false;
    const run = () => {
      if (started) {
        return;
      }
      started = true;
      void fn();
    };
    if (res.destroyed || res.writableFinished || res.closed) {
      run();
      return;
    }
    res.once("finish", run);
    res.once("close", run);
  };
}

/**
 * Aborts when the client disconnects before the response is complete. It listens on the
 * response, not the request: on current Node, `IncomingMessage` emits `close` once its body has
 * been consumed, which would abort healthy requests. After a complete response `close` also
 * fires, but `writableFinished` is then true and nothing is aborted.
 */
function abortOnClientClose(res: Response): AbortSignal {
  const controller = new AbortController();
  res.once("close", () => {
    if (!res.writableFinished) {
      controller.abort();
    }
  });
  return controller.signal;
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
