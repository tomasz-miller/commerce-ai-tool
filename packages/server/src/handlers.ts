import type { IncomingMessage } from "node:http";
import type { CommerceAIServer } from "./server.js";
import { errorResponse, jsonResponse, type HandlerResponse } from "./handler-response.js";
import {
  executeSearch,
  executeFacetSchema,
  executeSearchImage,
  executeSearchSuggestions,
  executeSearchVoice,
  executeTts,
  mapRouteError,
} from "./route-actions.js";
import {
  executeAddToCart,
  executeAddItemsToCart,
  executeGetCart,
  executeLogin,
  executeLogout,
  executeRemoveFromCart,
  executeUpdateCartQuantity,
} from "./cart-actions.js";
import {
  executeCreateOrder,
  executeGetShippingMethods,
  executeSetCartAddresses,
  executeSetShippingMethod,
} from "./checkout-actions.js";
import {
  executeAuthorizePayment,
  executeGetPaymentMethods,
} from "./payment-actions.js";
import { executeGetOrder } from "./order-actions.js";
import { readAnonymousId, readCartSessionHeader } from "./cart-session.js";
import { AUDIO_UPLOAD, IMAGE_UPLOAD, parseMultipart, readJsonBody } from "./utils/multipart.js";
import type { FlushDefer } from "./observability/flush.js";
import { localePolicy, parseSearchLocaleOptions } from "./utils/locale.js";
import { limitFailedLogins, retryAfterHeaders, type FixedWindowLimiter } from "./rate-limit.js";
import type {
  AddItemsToCartRequest,
  AddToCartRequest,
  AuthorizePaymentRequest,
  CartLoginRequest,
  CartMutationRequest,
  CreateOrderRequest,
  SearchRequestBody,
  SetCartAddressesRequest,
  SetShippingMethodRequest,
  SuggestionsRequestBody,
  TtsRequestBody,
  UpdateCartQuantityRequest,
} from "@commerce-ai-tool/core";

export type { HandlerResponse } from "./handler-response.js";

export interface CreateHandlersOptions {
  /**
   * Per-account login limiter, keyed on `hashLoginKey(email)`. Counts failed logins only
   * (reserve, then release unless the credentials were invalid) and rejects an exhausted email
   * before the attempt. Runs in addition to any per-client limiter
   * in front of the route.
   */
  loginEmailLimiter?: Pick<FixedWindowLimiter, "consume" | "release">;
}

/**
 * The low-level, framework-neutral handlers that {@link createExpressRouter} and
 * {@link createNextHandlers} are built on. Each takes a Node `IncomingMessage` (plus, for the AI
 * routes, a flush deferral and the request's abort signal) and returns a plain
 * {@link HandlerResponse}.
 *
 * These are the handlers without HTTP guards: they do not check the request `Content-Type` (the
 * 415 `UNSUPPORTED_MEDIA_TYPE` rule) and apply no per-client rate limits. The only limiter they
 * honour is `options.loginEmailLimiter`. A host that wires them into its own framework must add
 * the `Content-Type: application/json` check on JSON routes and its own per-client limits, or use
 * the Express or Next adapters, which apply both. Body size caps, input validation and error
 * mapping are part of the handlers themselves.
 */
export function createHandlers(server: CommerceAIServer, options: CreateHandlersOptions = {}) {
  return {
    async health(): Promise<HandlerResponse> {
      return jsonResponse({ status: "ok" });
    },

    async search(
      req: IncomingMessage,
      defer?: FlushDefer,
      signal?: AbortSignal,
    ): Promise<HandlerResponse> {
      try {
        const body = await readJsonBody<SearchRequestBody>(req);

        const result = await executeSearch(server, body, defer, signal);
        return jsonResponse(result);
      } catch (error) {
        const mapped = mapRouteError(error, "search", "Search failed", undefined, signal);
        return errorResponse(mapped.message, mapped.status, mapped.code);
      }
    },

    async facetSchema(): Promise<HandlerResponse> {
      try {
        return jsonResponse(await executeFacetSchema(server, undefined));
      } catch (error) {
        const mapped = mapRouteError(error, "facetSchema", "Facet schema failed");
        return errorResponse(mapped.message, mapped.status, mapped.code);
      }
    },

    async searchSuggestions(
      req: IncomingMessage,
      defer?: FlushDefer,
      signal?: AbortSignal,
    ): Promise<HandlerResponse> {
      try {
        const body = await readJsonBody<SuggestionsRequestBody>(req);

        const result = await executeSearchSuggestions(server, body, defer, signal);
        return jsonResponse(result);
      } catch (error) {
        const mapped = mapRouteError(error, "searchSuggestions", "Suggestions failed", undefined, signal);
        return errorResponse(mapped.message, mapped.status, mapped.code);
      }
    },

    async searchVoice(
      req: IncomingMessage,
      defer?: FlushDefer,
      signal?: AbortSignal,
    ): Promise<HandlerResponse> {
      let fields: Record<string, string> = {};
      let file: Awaited<ReturnType<typeof parseMultipart>>["file"];

      try {
        const parsed = await parseMultipart(req, AUDIO_UPLOAD);
        fields = parsed.fields;
        file = parsed.file;

        const result = await executeSearchVoice(server, fields, file, defer, signal);
        return jsonResponse(result);
      } catch (error) {
        const locales = parseSearchLocaleOptions(fields, localePolicy(server));
        const mapped = mapRouteError(error, "searchVoice", "Voice search failed", {
          queryLocale: locales.queryLocale,
          catalogLocale: locales.catalogLocale,
          mimeType: file?.mimeType,
          size: file?.buffer.length,
        }, signal);
        return errorResponse(mapped.message, mapped.status, mapped.code);
      }
    },

    async searchImage(
      req: IncomingMessage,
      defer?: FlushDefer,
      signal?: AbortSignal,
    ): Promise<HandlerResponse> {
      try {
        const { fields, file } = await parseMultipart(req, IMAGE_UPLOAD);
        const result = await executeSearchImage(server, fields, file, defer, signal);
        return jsonResponse(result);
      } catch (error) {
        const mapped = mapRouteError(error, "searchImage", "Image search failed", undefined, signal);
        return errorResponse(mapped.message, mapped.status, mapped.code);
      }
    },

    async tts(
      req: IncomingMessage,
      defer?: FlushDefer,
      signal?: AbortSignal,
    ): Promise<HandlerResponse> {
      try {
        const body = await readJsonBody<TtsRequestBody>(req);
        const audio = await executeTts(server, body.text, defer, signal);

        return {
          status: 200,
          headers: { "Content-Type": "audio/mpeg" },
          body: audio,
        };
      } catch (error) {
        const mapped = mapRouteError(error, "tts", "TTS failed", undefined, signal);
        return errorResponse(mapped.message, mapped.status, mapped.code);
      }
    },

    async getCart(req: IncomingMessage): Promise<HandlerResponse> {
      try {
        const query = parseRequestQuery(req);
        const result = await executeGetCart(server, {
          anonymousId: readAnonymousId(req.headers) ?? "",
          catalogLocale: query.catalogLocale,
          sessionToken: readCartSessionHeader(req.headers),
        });
        return jsonResponse(result);
      } catch (error) {
        const mapped = mapRouteError(error, "getCart", "Get cart failed");
        return errorResponse(mapped.message, mapped.status, mapped.code);
      }
    },

    async addToCart(req: IncomingMessage): Promise<HandlerResponse> {
      try {
        const body = await readJsonBody<AddToCartRequest>(req);
        const result = await executeAddToCart(server, body);
        return jsonResponse(result);
      } catch (error) {
        const mapped = mapRouteError(error, "addToCart", "Add to cart failed");
        return errorResponse(mapped.message, mapped.status, mapped.code);
      }
    },

    async addItemsToCart(req: IncomingMessage): Promise<HandlerResponse> {
      try {
        const body = await readJsonBody<AddItemsToCartRequest>(req);
        const result = await executeAddItemsToCart(server, body);
        return jsonResponse(result);
      } catch (error) {
        const mapped = mapRouteError(error, "addItemsToCart", "Add items to cart failed");
        return errorResponse(mapped.message, mapped.status, mapped.code);
      }
    },

    async removeFromCart(req: IncomingMessage): Promise<HandlerResponse> {
      try {
        const body = await readJsonBody<CartMutationRequest>(req);
        const result = await executeRemoveFromCart(server, body);
        return jsonResponse(result);
      } catch (error) {
        const mapped = mapRouteError(error, "removeFromCart", "Remove from cart failed");
        return errorResponse(mapped.message, mapped.status, mapped.code);
      }
    },

    async updateCartQuantity(req: IncomingMessage): Promise<HandlerResponse> {
      try {
        const body = await readJsonBody<UpdateCartQuantityRequest>(req);
        const result = await executeUpdateCartQuantity(server, body);
        return jsonResponse(result);
      } catch (error) {
        const mapped = mapRouteError(error, "updateCartQuantity", "Update cart quantity failed");
        return errorResponse(mapped.message, mapped.status, mapped.code);
      }
    },

    async setCartAddresses(req: IncomingMessage): Promise<HandlerResponse> {
      try {
        const body = await readJsonBody<SetCartAddressesRequest>(req);
        return jsonResponse(await executeSetCartAddresses(server, body));
      } catch (error) {
        const mapped = mapRouteError(error, "setCartAddresses", "Set cart addresses failed");
        return errorResponse(mapped.message, mapped.status, mapped.code);
      }
    },

    async getShippingMethods(req: IncomingMessage): Promise<HandlerResponse> {
      try {
        const query = parseRequestQuery(req);
        return jsonResponse(
          await executeGetShippingMethods(server, {
            anonymousId: readAnonymousId(req.headers),
            cartId: query.cartId,
            catalogLocale: query.catalogLocale,
            sessionToken: readCartSessionHeader(req.headers),
          }),
        );
      } catch (error) {
        const mapped = mapRouteError(
          error,
          "getShippingMethods",
          "Get shipping methods failed",
        );
        return errorResponse(mapped.message, mapped.status, mapped.code);
      }
    },

    async setShippingMethod(req: IncomingMessage): Promise<HandlerResponse> {
      try {
        const body = await readJsonBody<SetShippingMethodRequest>(req);
        return jsonResponse(await executeSetShippingMethod(server, body));
      } catch (error) {
        const mapped = mapRouteError(
          error,
          "setShippingMethod",
          "Set shipping method failed",
        );
        return errorResponse(mapped.message, mapped.status, mapped.code);
      }
    },

    async createOrder(req: IncomingMessage): Promise<HandlerResponse> {
      try {
        const body = await readJsonBody<CreateOrderRequest>(req);
        return jsonResponse(await executeCreateOrder(server, body));
      } catch (error) {
        const mapped = mapRouteError(error, "createOrder", "Create order failed");
        return errorResponse(mapped.message, mapped.status, mapped.code);
      }
    },

    async getPaymentMethods(req: IncomingMessage): Promise<HandlerResponse> {
      try {
        const query = parseRequestQuery(req);
        return jsonResponse(
          await executeGetPaymentMethods(server, {
            anonymousId: readAnonymousId(req.headers),
            cartId: query.cartId,
            catalogLocale: query.catalogLocale,
            sessionToken: readCartSessionHeader(req.headers),
          }),
        );
      } catch (error) {
        const mapped = mapRouteError(
          error,
          "getPaymentMethods",
          "Get payment methods failed",
        );
        return errorResponse(mapped.message, mapped.status, mapped.code);
      }
    },

    async authorizePayment(req: IncomingMessage): Promise<HandlerResponse> {
      try {
        const body = await readJsonBody<AuthorizePaymentRequest>(req);
        return jsonResponse(await executeAuthorizePayment(server, body));
      } catch (error) {
        const mapped = mapRouteError(error, "authorizePayment", "Payment failed");
        return errorResponse(mapped.message, mapped.status, mapped.code);
      }
    },

    async getOrder(req: IncomingMessage): Promise<HandlerResponse> {
      try {
        const query = parseRequestQuery(req);
        return jsonResponse(
          await executeGetOrder(server, {
            orderNumber: query.orderNumber ?? "",
            anonymousId: readAnonymousId(req.headers),
            catalogLocale: query.catalogLocale,
            sessionToken: readCartSessionHeader(req.headers),
          }),
        );
      } catch (error) {
        const mapped = mapRouteError(error, "getOrder", "Get order failed");
        return errorResponse(mapped.message, mapped.status, mapped.code);
      }
    },

    async login(req: IncomingMessage): Promise<HandlerResponse> {
      try {
        const body = await readJsonBody<CartLoginRequest>(req);
        const result = await limitFailedLogins(options.loginEmailLimiter, body.email, () =>
          executeLogin(server, body),
        );
        return jsonResponse(result);
      } catch (error) {
        const mapped = mapRouteError(error, "login", "Login failed");
        return errorResponse(mapped.message, mapped.status, mapped.code, retryAfterHeaders(error));
      }
    },

    async logout(req?: IncomingMessage): Promise<HandlerResponse> {
      try {
        const result = await executeLogout(server, readCartSessionHeader(req?.headers));
        return jsonResponse(result);
      } catch (error) {
        const mapped = mapRouteError(error, "logout", "Logout failed");
        return errorResponse(mapped.message, mapped.status, mapped.code);
      }
    },
  };
}

export type CommerceAIHandlers = ReturnType<typeof createHandlers>;

function parseRequestQuery(req: IncomingMessage): Record<string, string> {
  const query: Record<string, string> = {};
  const url = new URL(req.url ?? "", "http://localhost");
  for (const [key, value] of url.searchParams.entries()) {
    query[key] = value;
  }
  return query;
}
