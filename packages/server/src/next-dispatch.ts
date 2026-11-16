import type { IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import type { CommerceAIConfig } from "@commerce-ai-tool/core";
import { errorResponse, toWebResponse } from "./handler-response.js";
import { createHandlers } from "./handlers.js";
import type { FlushDefer } from "./observability/flush.js";
import { mapRouteError } from "./route-actions.js";
import {
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
  defaultClientKey,
  LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
  LOGIN_RATE_LIMIT_MESSAGE,
  LOGIN_RATE_LIMIT_WINDOW_MS,
  ORDER_RATE_LIMIT_MAX_ATTEMPTS,
  ORDER_RATE_LIMIT_MESSAGE,
  ORDER_RATE_LIMIT_WINDOW_MS,
  PAYMENT_RATE_LIMIT_MAX_ATTEMPTS,
  PAYMENT_RATE_LIMIT_MESSAGE,
  PAYMENT_RATE_LIMIT_WINDOW_MS,
  retryAfterHeaders,
  SUGGESTIONS_RATE_LIMIT_MAX_REQUESTS,
  type FixedWindowLimiter,
  type RateLimitOption,
} from "./rate-limit.js";
import { createCommerceAIServer } from "./server.js";

export interface NextHandlerOptions {
  /**
   * Client key for the rate limiters. Defaults to the right-most `X-Forwarded-For` entry,
   * then `x-real-ip`, then `"local"`. That default is only safe behind a proxy that sets or
   * appends `X-Forwarded-For`; otherwise derive the key from a header your platform controls.
   */
  clientKey?: (req: Request) => string;
  /**
   * Rate limit for the AI routes. Defaults to 30 requests / minute per client, shared by
   * `search`, `searchVoice`, `searchImage` and `tts`. `searchSuggestions` has its own bucket of
   * 120 requests / minute (see `suggestionsRateLimit`). `false` disables both.
   */
  aiRateLimit?: RateLimitOption;
  /**
   * Rate limit for `searchSuggestions`, which can make an AI call per request. Defaults to
   * 120 requests / minute per client in its own bucket; `aiRateLimit` does not change it. `false`
   * disables it, and so does `aiRateLimit: false`.
   */
  suggestionsRateLimit?: RateLimitOption;
  /**
   * Rate limit for `login`. Defaults to 10 attempts / 15 minutes per client and, separately,
   * 10 failed logins / 15 minutes per email address (SHA-256 hashed); an exhausted email is
   * rejected before the attempt. Both must pass. `false` disables both.
   */
  loginRateLimit?: RateLimitOption;
  /** Rate limit for `createOrder`. Defaults to 20 attempts / 15 minutes per client. */
  orderRateLimit?: RateLimitOption;
  /** Rate limit for `authorizePayment`. Defaults to 20 attempts / 15 minutes per client. */
  paymentRateLimit?: RateLimitOption;
  /**
   * Schedules the Langfuse flush to run after the response is sent. Pass `after` from
   * `next/server` (Next.js 15.1+, stable in 16): `createNextHandlers(config, { defer: after })`.
   * Without it the flush starts detached (`void flushLangfuse()`) right after the request span
   * ends. Either way it is not awaited and a failing flush never fails the request.
   */
  defer?: FlushDefer;
}

function createLimiter(
  option: RateLimitOption | undefined,
  defaults: { windowMs: number; limit: number; message: string },
): FixedWindowLimiter | undefined {
  if (option === false) {
    return undefined;
  }
  return createFixedWindowLimiter({
    windowMs: option?.windowMs ?? defaults.windowMs,
    limit: option?.limit ?? defaults.limit,
    message: defaults.message,
  });
}

/**
 * Presents a Web `Request` to the Node-style handlers of {@link createHandlers}: a readable
 * body stream plus `headers`, `method` and `url`. Both adapters then run the very same handler
 * code, including the body size caps, multipart parsing and error mapping. Next.js route
 * handlers run on the Node.js runtime, which this package already requires.
 */
function toNodeRequest(req: Request): IncomingMessage {
  const url = new URL(req.url);
  const body = req.body
    ? Readable.fromWeb(req.body as unknown as NodeReadableStream<Uint8Array>)
    : Readable.from([]);
  // A body that is never read (a rejected request, a GET) cannot fail, but one that is read can
  // error mid-stream (client abort). Readers attach their own listener to settle; this one only
  // keeps an error nobody is waiting for from becoming an uncaught exception.
  body.on("error", () => undefined);
  return Object.assign(body, {
    headers: Object.fromEntries(req.headers),
    method: req.method,
    url: `${url.pathname}${url.search}`,
  }) as unknown as IncomingMessage;
}

export interface NextDispatcher {
  /** Runs the route's limiter, content-type check and handler, and answers as a Web `Response`. */
  dispatch(route: RouteDefinition, req?: Request): Promise<Response>;
}

/**
 * The state behind one handler instance: the server, the shared handlers and the rate-limit
 * buckets. Every route served by the same dispatcher draws from the same buckets, so create it
 * once per process, not per route file.
 */
export function createNextDispatcher(
  config: CommerceAIConfig,
  options: NextHandlerOptions = {},
): NextDispatcher {
  const server = createCommerceAIServer({ config });
  const loginDefaults = {
    windowMs: LOGIN_RATE_LIMIT_WINDOW_MS,
    limit: LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
    message: LOGIN_RATE_LIMIT_MESSAGE,
  };
  const handlers = createHandlers(server, {
    loginEmailLimiter: createLimiter(options.loginRateLimit, loginDefaults),
  });
  const clientKey = options.clientKey ?? ((req: Request) => defaultClientKey(req.headers));

  const limiters: Record<RouteBucket, FixedWindowLimiter | undefined> = {
    ai: createLimiter(options.aiRateLimit, {
      windowMs: AI_RATE_LIMIT_WINDOW_MS,
      limit: AI_RATE_LIMIT_MAX_REQUESTS,
      message: AI_RATE_LIMIT_MESSAGE,
    }),
    suggestions: createLimiter(options.aiRateLimit === false ? false : options.suggestionsRateLimit, {
      windowMs: AI_RATE_LIMIT_WINDOW_MS,
      limit: SUGGESTIONS_RATE_LIMIT_MAX_REQUESTS,
      message: AI_RATE_LIMIT_MESSAGE,
    }),
    login: createLimiter(options.loginRateLimit, loginDefaults),
    order: createLimiter(options.orderRateLimit, {
      windowMs: ORDER_RATE_LIMIT_WINDOW_MS,
      limit: ORDER_RATE_LIMIT_MAX_ATTEMPTS,
      message: ORDER_RATE_LIMIT_MESSAGE,
    }),
    payment: createLimiter(options.paymentRateLimit, {
      windowMs: PAYMENT_RATE_LIMIT_WINDOW_MS,
      limit: PAYMENT_RATE_LIMIT_MAX_ATTEMPTS,
      message: PAYMENT_RATE_LIMIT_MESSAGE,
    }),
  };

  return {
    async dispatch(route, req) {
      let nodeRequest: IncomingMessage | undefined;
      try {
        if (req) {
          if (route.bucket) {
            limiters[route.bucket]?.consume(clientKey(req));
          }
          const rejected = rejectUnsupportedContentType(route, req.headers.get("content-type"));
          if (rejected) {
            return toWebResponse(rejected);
          }
          nodeRequest = toNodeRequest(req);
        }
      } catch (error) {
        const mapped = mapRouteError(error, route.name, "Request failed", undefined, req?.signal);
        return toWebResponse(
          errorResponse(mapped.message, mapped.status, mapped.code, retryAfterHeaders(error)),
        );
      }

      return toWebResponse(
        await invokeRoute(handlers, route, nodeRequest, {
          defer: options.defer,
          signal: req?.signal,
        }),
      );
    },
  };
}
