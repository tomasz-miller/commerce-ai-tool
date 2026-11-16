import type { IncomingMessage } from "node:http";
import { errorResponse, type HandlerResponse } from "./handler-response.js";
import type { CommerceAIHandlers } from "./handlers.js";
import { assertJsonContentType } from "./input-limits.js";
import type { FlushDefer } from "./observability/flush.js";
import { mapRouteError } from "./route-actions.js";

/** Rate-limit bucket a route draws from. The AI routes except suggestions share the `ai` bucket. */
export type RouteBucket = "ai" | "suggestions" | "login" | "order" | "payment";

/** Request body a route expects: JSON routes answer 415 for any other `Content-Type`. */
export type RouteBody = "json" | "multipart" | "none";

export interface RouteDefinition {
  /** Method name on `createHandlers(...)`. */
  readonly name: keyof CommerceAIHandlers;
  readonly method: "GET" | "POST";
  /** Path relative to the adapter's base path, with a leading slash. */
  readonly path: string;
  readonly body: RouteBody;
  readonly bucket?: RouteBucket;
  /** Whether the handler takes the flush `defer` and the request abort signal (the AI routes). */
  readonly requestContext?: boolean;
}

/**
 * The route table. The Express router registers it and the Next adapters dispatch from it, so a
 * route, its body type and its rate-limit bucket are declared once.
 */
export const COMMERCE_AI_ROUTES: readonly RouteDefinition[] = [
  { name: "health", method: "GET", path: "/health", body: "none" },
  { name: "search", method: "POST", path: "/search", body: "json", bucket: "ai", requestContext: true },
  { name: "facetSchema", method: "GET", path: "/search/facet-schema", body: "none" },
  {
    name: "searchSuggestions",
    method: "POST",
    path: "/search/suggestions",
    body: "json",
    bucket: "suggestions",
    requestContext: true,
  },
  {
    name: "searchVoice",
    method: "POST",
    path: "/search/voice",
    body: "multipart",
    bucket: "ai",
    requestContext: true,
  },
  {
    name: "searchImage",
    method: "POST",
    path: "/search/image",
    body: "multipart",
    bucket: "ai",
    requestContext: true,
  },
  { name: "tts", method: "POST", path: "/tts", body: "json", bucket: "ai", requestContext: true },
  { name: "getCart", method: "GET", path: "/cart", body: "none" },
  { name: "addToCart", method: "POST", path: "/cart/add", body: "json" },
  { name: "addItemsToCart", method: "POST", path: "/cart/add-items", body: "json" },
  { name: "removeFromCart", method: "POST", path: "/cart/remove", body: "json" },
  { name: "updateCartQuantity", method: "POST", path: "/cart/update-quantity", body: "json" },
  { name: "setCartAddresses", method: "POST", path: "/cart/addresses", body: "json" },
  { name: "getShippingMethods", method: "GET", path: "/cart/shipping-methods", body: "none" },
  { name: "setShippingMethod", method: "POST", path: "/cart/shipping-method", body: "json" },
  { name: "getPaymentMethods", method: "GET", path: "/cart/payment-methods", body: "none" },
  { name: "authorizePayment", method: "POST", path: "/cart/payment", body: "json", bucket: "payment" },
  { name: "createOrder", method: "POST", path: "/cart/order", body: "json", bucket: "order" },
  { name: "getOrder", method: "GET", path: "/orders", body: "none" },
  { name: "login", method: "POST", path: "/cart/login", body: "json", bucket: "login" },
  { name: "logout", method: "POST", path: "/cart/logout", body: "none" },
];

const ROUTES_BY_KEY: ReadonlyMap<string, RouteDefinition> = new Map(
  COMMERCE_AI_ROUTES.map((route) => [`${route.method} ${route.path}`, route]),
);

const ROUTES_BY_NAME: ReadonlyMap<string, RouteDefinition> = new Map(
  COMMERCE_AI_ROUTES.map((route) => [route.name, route]),
);

export function routeByName(name: keyof CommerceAIHandlers): RouteDefinition {
  const route = ROUTES_BY_NAME.get(name);
  if (!route) {
    throw new Error(`Unknown commerce-ai route: ${name}`);
  }
  return route;
}

/**
 * Resolves already-split path segments (a Next catch-all `params.path`) to a route. The lookup
 * is an exact match against the table, and a segment that is empty, `.`, `..` or contains a path
 * separator never matches, so an encoded slash (`cart%2Fadd` decoded to `cart/add`) or a
 * traversal segment cannot reach a route it does not literally name. Paths are case-sensitive
 * (`/Cart` is not `/cart`), as in Express. `HEAD` resolves to the matching `GET` route. Anything
 * else, including a known path with the wrong method, is `undefined` (Express leaves both
 * unmatched, which answers 404).
 */
export function matchRoute(method: string, segments: readonly string[]): RouteDefinition | undefined {
  if (segments.length === 0) {
    return undefined;
  }
  for (const segment of segments) {
    if (
      typeof segment !== "string" ||
      segment === "" ||
      segment === "." ||
      segment === ".." ||
      segment.includes("/") ||
      segment.includes("\\")
    ) {
      return undefined;
    }
  }
  const upper = method.toUpperCase();
  return ROUTES_BY_KEY.get(`${upper === "HEAD" ? "GET" : upper} /${segments.join("/")}`);
}

/**
 * JSON POST routes reject other media types (415). Returns the response to send, or `undefined`
 * when the route accepts the request's `Content-Type`.
 */
export function rejectUnsupportedContentType(
  route: RouteDefinition,
  contentType: string | null | undefined,
): HandlerResponse | undefined {
  if (route.body !== "json") {
    return undefined;
  }
  try {
    assertJsonContentType(contentType);
    return undefined;
  } catch (error) {
    const mapped = mapRouteError(error, "contentType", "Unsupported media type");
    return errorResponse(mapped.message, mapped.status, mapped.code);
  }
}

/** Calls the route's handler. Handlers ignore arguments they do not declare. */
export function invokeRoute(
  handlers: CommerceAIHandlers,
  route: RouteDefinition,
  req: IncomingMessage | undefined,
  context: { defer?: FlushDefer; signal?: AbortSignal } = {},
): Promise<HandlerResponse> {
  const handler = handlers[route.name] as (
    req?: IncomingMessage,
    defer?: FlushDefer,
    signal?: AbortSignal,
  ) => Promise<HandlerResponse>;
  return route.requestContext ? handler(req, context.defer, context.signal) : handler(req);
}
