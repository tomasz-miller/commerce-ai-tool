import type {
  AddItemsToCartRequest,
  AddToCartRequest,
  AuthorizePaymentRequest,
  CartLoginRequest,
  CartMutationRequest,
  CommerceAIConfig,
  CreateOrderRequest,
  SetCartAddressesRequest,
  SetShippingMethodRequest,
  UpdateCartQuantityRequest,
} from "@commerce-ai-tool/core";
import { createHandlers } from "./handlers.js";
import { toWebErrorResponse, toWebResponse } from "./handler-response.js";
import { createCommerceAIServer } from "./server.js";
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
import { readCartSessionHeader } from "./cart-session.js";
import {
  clientKeyFromWebHeaders,
  createLoginAttemptLimiter,
  ORDER_RATE_LIMIT_MAX_ATTEMPTS,
  ORDER_RATE_LIMIT_MESSAGE,
  ORDER_RATE_LIMIT_WINDOW_MS,
  PAYMENT_RATE_LIMIT_MAX_ATTEMPTS,
  PAYMENT_RATE_LIMIT_MESSAGE,
  PAYMENT_RATE_LIMIT_WINDOW_MS,
  TooManyRequestsError,
} from "./login-rate-limit.js";
import { parseMultipartRequest } from "./utils/multipart.js";

export interface NextHandlers {
  health: () => Promise<Response>;
  search: (req: Request) => Promise<Response>;
  facetSchema: () => Promise<Response>;
  searchSuggestions: (req: Request) => Promise<Response>;
  searchVoice: (req: Request) => Promise<Response>;
  searchImage: (req: Request) => Promise<Response>;
  tts: (req: Request) => Promise<Response>;
  getCart: (req: Request) => Promise<Response>;
  addToCart: (req: Request) => Promise<Response>;
  addItemsToCart: (req: Request) => Promise<Response>;
  removeFromCart: (req: Request) => Promise<Response>;
  updateCartQuantity: (req: Request) => Promise<Response>;
  setCartAddresses: (req: Request) => Promise<Response>;
  getShippingMethods: (req: Request) => Promise<Response>;
  setShippingMethod: (req: Request) => Promise<Response>;
  createOrder: (req: Request) => Promise<Response>;
  getPaymentMethods: (req: Request) => Promise<Response>;
  authorizePayment: (req: Request) => Promise<Response>;
  getOrder: (req: Request) => Promise<Response>;
  login: (req: Request) => Promise<Response>;
  logout: () => Promise<Response>;
}

const loginLimiter = createLoginAttemptLimiter();
const orderLimiter = createLoginAttemptLimiter({
  windowMs: ORDER_RATE_LIMIT_WINDOW_MS,
  limit: ORDER_RATE_LIMIT_MAX_ATTEMPTS,
});
const paymentLimiter = createLoginAttemptLimiter({
  windowMs: PAYMENT_RATE_LIMIT_WINDOW_MS,
  limit: PAYMENT_RATE_LIMIT_MAX_ATTEMPTS,
});

export function createNextHandlers(config: CommerceAIConfig): NextHandlers {
  const server = createCommerceAIServer({ config });
  const handlers = createHandlers(server);

  return {
    health: async () => toWebResponse(await handlers.health()),

    facetSchema: async () => {
      try {
        return Response.json(await executeFacetSchema(server, undefined));
      } catch (error) {
        const mapped = mapRouteError(error, "facetSchema", "Facet schema failed");
        return toWebErrorResponse(mapped.message, mapped.status);
      }
    },

    search: async (req: Request) => {
      try {
        const body = (await req.json()) as {
          query: string;
          queryLocale?: string;
          catalogLocale?: string;
          locale?: string;
          limit?: number;
          enableMissions?: boolean;
        };

        const result = await executeSearch(server, body);
        return Response.json(result);
      } catch (error) {
        const mapped = mapRouteError(error, "search", "Search failed");
        return toWebErrorResponse(mapped.message, mapped.status);
      }
    },

    searchSuggestions: async (req: Request) => {
      try {
        const body = (await req.json()) as {
          query: string;
          queryLocale?: string;
          catalogLocale?: string;
          locale?: string;
          limit?: number;
        };

        const result = await executeSearchSuggestions(server, body);
        return Response.json(result);
      } catch (error) {
        const mapped = mapRouteError(error, "searchSuggestions", "Suggestions failed");
        return toWebErrorResponse(mapped.message, mapped.status);
      }
    },

    searchVoice: async (req: Request) => {
      let fields: Record<string, string> = {};
      let file: Awaited<ReturnType<typeof parseMultipartRequest>>["file"];

      try {
        const parsed = await parseMultipartRequest(req);
        fields = parsed.fields;
        file = parsed.file;

        const result = await executeSearchVoice(server, fields, file);
        return Response.json(result);
      } catch (error) {
        const mapped = mapRouteError(error, "searchVoice", "Voice search failed", {
          queryLocale: fields.queryLocale ?? fields.locale,
          catalogLocale: fields.catalogLocale,
          mimeType: file?.mimeType,
          size: file?.buffer.length,
        });
        return toWebErrorResponse(mapped.message, mapped.status);
      }
    },

    searchImage: async (req: Request) => {
      try {
        const { fields, file } = await parseMultipartRequest(req);
        const result = await executeSearchImage(server, fields, file);
        return Response.json(result);
      } catch (error) {
        const mapped = mapRouteError(error, "searchImage", "Image search failed");
        return toWebErrorResponse(mapped.message, mapped.status);
      }
    },

    tts: async (req: Request) => {
      try {
        const body = (await req.json()) as { text: string };
        const audio = await executeTts(server, body.text);

        return new Response(audio, {
          headers: { "Content-Type": "audio/mpeg" },
        });
      } catch (error) {
        const mapped = mapRouteError(error, "tts", "TTS failed");
        return toWebErrorResponse(mapped.message, mapped.status);
      }
    },

    getCart: async (req: Request) => {
      try {
        const url = new URL(req.url);
        const result = await executeGetCart(server, {
          anonymousId: url.searchParams.get("anonymousId") ?? "",
          catalogLocale: url.searchParams.get("catalogLocale") ?? undefined,
          sessionToken: readCartSessionHeader(req.headers),
        });
        return Response.json(result);
      } catch (error) {
        const mapped = mapRouteError(error, "getCart", "Get cart failed");
        return toWebErrorResponse(mapped.message, mapped.status);
      }
    },

    addToCart: async (req: Request) => {
      try {
        const result = await executeAddToCart(server, (await req.json()) as AddToCartRequest);
        return Response.json(result);
      } catch (error) {
        const mapped = mapRouteError(error, "addToCart", "Add to cart failed");
        return toWebErrorResponse(mapped.message, mapped.status);
      }
    },

    addItemsToCart: async (req: Request) => {
      try {
        const result = await executeAddItemsToCart(
          server,
          (await req.json()) as AddItemsToCartRequest,
        );
        return Response.json(result);
      } catch (error) {
        const mapped = mapRouteError(error, "addItemsToCart", "Add items to cart failed");
        return toWebErrorResponse(mapped.message, mapped.status);
      }
    },

    removeFromCart: async (req: Request) => {
      try {
        const result = await executeRemoveFromCart(server, (await req.json()) as CartMutationRequest);
        return Response.json(result);
      } catch (error) {
        const mapped = mapRouteError(error, "removeFromCart", "Remove from cart failed");
        return toWebErrorResponse(mapped.message, mapped.status);
      }
    },

    updateCartQuantity: async (req: Request) => {
      try {
        const result = await executeUpdateCartQuantity(
          server,
          (await req.json()) as UpdateCartQuantityRequest,
        );
        return Response.json(result);
      } catch (error) {
        const mapped = mapRouteError(error, "updateCartQuantity", "Update cart quantity failed");
        return toWebErrorResponse(mapped.message, mapped.status);
      }
    },

    setCartAddresses: async (req: Request) => {
      try {
        const result = await executeSetCartAddresses(
          server,
          (await req.json()) as SetCartAddressesRequest,
        );
        return Response.json(result);
      } catch (error) {
        const mapped = mapRouteError(error, "setCartAddresses", "Set cart addresses failed");
        return toWebErrorResponse(mapped.message, mapped.status);
      }
    },

    getShippingMethods: async (req: Request) => {
      try {
        const url = new URL(req.url);
        const result = await executeGetShippingMethods(server, {
          anonymousId: url.searchParams.get("anonymousId") ?? undefined,
          cartId: url.searchParams.get("cartId") ?? undefined,
          catalogLocale: url.searchParams.get("catalogLocale") ?? undefined,
          sessionToken: readCartSessionHeader(req.headers),
        });
        return Response.json(result);
      } catch (error) {
        const mapped = mapRouteError(
          error,
          "getShippingMethods",
          "Get shipping methods failed",
        );
        return toWebErrorResponse(mapped.message, mapped.status);
      }
    },

    setShippingMethod: async (req: Request) => {
      try {
        const result = await executeSetShippingMethod(
          server,
          (await req.json()) as SetShippingMethodRequest,
        );
        return Response.json(result);
      } catch (error) {
        const mapped = mapRouteError(
          error,
          "setShippingMethod",
          "Set shipping method failed",
        );
        return toWebErrorResponse(mapped.message, mapped.status);
      }
    },

    createOrder: async (req: Request) => {
      try {
        orderLimiter.consume(clientKeyFromWebHeaders(req.headers));
        const result = await executeCreateOrder(
          server,
          (await req.json()) as CreateOrderRequest,
        );
        return Response.json(result);
      } catch (error) {
        if (error instanceof TooManyRequestsError) {
          return Response.json(
            { error: ORDER_RATE_LIMIT_MESSAGE },
            {
              status: 429,
              headers: { "Retry-After": String(error.retryAfterSeconds) },
            },
          );
        }

        const mapped = mapRouteError(error, "createOrder", "Create order failed");
        return toWebErrorResponse(mapped.message, mapped.status);
      }
    },

    getPaymentMethods: async (req: Request) => {
      try {
        const url = new URL(req.url);
        const result = await executeGetPaymentMethods(server, {
          anonymousId: url.searchParams.get("anonymousId") ?? undefined,
          cartId: url.searchParams.get("cartId") ?? undefined,
          catalogLocale: url.searchParams.get("catalogLocale") ?? undefined,
          sessionToken: readCartSessionHeader(req.headers),
        });
        return Response.json(result);
      } catch (error) {
        const mapped = mapRouteError(
          error,
          "getPaymentMethods",
          "Get payment methods failed",
        );
        return toWebErrorResponse(mapped.message, mapped.status);
      }
    },

    authorizePayment: async (req: Request) => {
      try {
        paymentLimiter.consume(clientKeyFromWebHeaders(req.headers));
        const result = await executeAuthorizePayment(
          server,
          (await req.json()) as AuthorizePaymentRequest,
        );
        return Response.json(result);
      } catch (error) {
        if (error instanceof TooManyRequestsError) {
          return Response.json(
            { error: PAYMENT_RATE_LIMIT_MESSAGE },
            {
              status: 429,
              headers: { "Retry-After": String(error.retryAfterSeconds) },
            },
          );
        }

        const mapped = mapRouteError(error, "authorizePayment", "Payment failed");
        return toWebErrorResponse(mapped.message, mapped.status);
      }
    },

    getOrder: async (req: Request) => {
      try {
        const url = new URL(req.url);
        const result = await executeGetOrder(server, {
          orderNumber: url.searchParams.get("orderNumber") ?? "",
          anonymousId: url.searchParams.get("anonymousId") ?? undefined,
          catalogLocale: url.searchParams.get("catalogLocale") ?? undefined,
          sessionToken: readCartSessionHeader(req.headers),
        });
        return Response.json(result);
      } catch (error) {
        const mapped = mapRouteError(error, "getOrder", "Get order failed");
        return toWebErrorResponse(mapped.message, mapped.status);
      }
    },

    login: async (req: Request) => {
      try {
        loginLimiter.consume(clientKeyFromWebHeaders(req.headers));
        const result = await executeLogin(server, (await req.json()) as CartLoginRequest);
        return Response.json(result);
      } catch (error) {
        if (error instanceof TooManyRequestsError) {
          return Response.json(
            { error: error.message },
            {
              status: 429,
              headers: { "Retry-After": String(error.retryAfterSeconds) },
            },
          );
        }

        const mapped = mapRouteError(error, "login", "Login failed");
        return toWebErrorResponse(mapped.message, mapped.status);
      }
    },

    logout: async () => {
      try {
        const result = await executeLogout();
        return Response.json(result);
      } catch (error) {
        const mapped = mapRouteError(error, "logout", "Logout failed");
        return toWebErrorResponse(mapped.message, mapped.status);
      }
    },
  };
}
