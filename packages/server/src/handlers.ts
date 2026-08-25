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
import { readCartSessionHeader } from "./cart-session.js";
import { parseMultipart, readJsonBody } from "./utils/multipart.js";
import type {
  AddToCartRequest,
  CartLoginRequest,
  CartMutationRequest,
  CreateOrderRequest,
  SetCartAddressesRequest,
  SetShippingMethodRequest,
  UpdateCartQuantityRequest,
} from "@commerce-ai-tool/core";

export type { HandlerResponse } from "./handler-response.js";

export function createHandlers(server: CommerceAIServer) {
  return {
    async health(): Promise<HandlerResponse> {
      return jsonResponse({ status: "ok" });
    },

    async search(req: IncomingMessage): Promise<HandlerResponse> {
      try {
        const body = await readJsonBody<{
          query: string;
          queryLocale?: string;
          catalogLocale?: string;
          locale?: string;
          limit?: number;
        }>(req);

        const result = await executeSearch(server, body);
        return jsonResponse(result);
      } catch (error) {
        const mapped = mapRouteError(error, "search", "Search failed");
        return errorResponse(mapped.message, mapped.status);
      }
    },

    async facetSchema(): Promise<HandlerResponse> {
      try {
        return jsonResponse(await executeFacetSchema(server, undefined));
      } catch (error) {
        const mapped = mapRouteError(error, "facetSchema", "Facet schema failed");
        return errorResponse(mapped.message, mapped.status);
      }
    },

    async searchSuggestions(req: IncomingMessage): Promise<HandlerResponse> {
      try {
        const body = await readJsonBody<{
          query: string;
          queryLocale?: string;
          catalogLocale?: string;
          locale?: string;
          limit?: number;
        }>(req);

        const result = await executeSearchSuggestions(server, body);
        return jsonResponse(result);
      } catch (error) {
        const mapped = mapRouteError(error, "searchSuggestions", "Suggestions failed");
        return errorResponse(mapped.message, mapped.status);
      }
    },

    async searchVoice(req: IncomingMessage): Promise<HandlerResponse> {
      let fields: Record<string, string> = {};
      let file: Awaited<ReturnType<typeof parseMultipart>>["file"];

      try {
        const parsed = await parseMultipart(req);
        fields = parsed.fields;
        file = parsed.file;

        const result = await executeSearchVoice(server, fields, file);
        return jsonResponse(result);
      } catch (error) {
        const mapped = mapRouteError(error, "searchVoice", "Voice search failed", {
          queryLocale: fields.queryLocale ?? fields.locale,
          catalogLocale: fields.catalogLocale,
          mimeType: file?.mimeType,
          size: file?.buffer.length,
        });
        return errorResponse(mapped.message, mapped.status);
      }
    },

    async searchImage(req: IncomingMessage): Promise<HandlerResponse> {
      try {
        const { fields, file } = await parseMultipart(req);
        const result = await executeSearchImage(server, fields, file);
        return jsonResponse(result);
      } catch (error) {
        const mapped = mapRouteError(error, "searchImage", "Image search failed");
        return errorResponse(mapped.message, mapped.status);
      }
    },

    async tts(req: IncomingMessage): Promise<HandlerResponse> {
      try {
        const body = await readJsonBody<{ text: string }>(req);
        const audio = await executeTts(server, body.text);

        return {
          status: 200,
          headers: { "Content-Type": "audio/mpeg" },
          body: audio,
        };
      } catch (error) {
        const mapped = mapRouteError(error, "tts", "TTS failed");
        return errorResponse(mapped.message, mapped.status);
      }
    },

    async getCart(req: IncomingMessage): Promise<HandlerResponse> {
      try {
        const query = parseRequestQuery(req);
        const result = await executeGetCart(server, {
          anonymousId: query.anonymousId ?? "",
          catalogLocale: query.catalogLocale,
          sessionToken: readCartSessionHeader(req.headers),
        });
        return jsonResponse(result);
      } catch (error) {
        const mapped = mapRouteError(error, "getCart", "Get cart failed");
        return errorResponse(mapped.message, mapped.status);
      }
    },

    async addToCart(req: IncomingMessage): Promise<HandlerResponse> {
      try {
        const body = await readJsonBody<AddToCartRequest>(req);
        const result = await executeAddToCart(server, body);
        return jsonResponse(result);
      } catch (error) {
        const mapped = mapRouteError(error, "addToCart", "Add to cart failed");
        return errorResponse(mapped.message, mapped.status);
      }
    },

    async removeFromCart(req: IncomingMessage): Promise<HandlerResponse> {
      try {
        const body = await readJsonBody<CartMutationRequest>(req);
        const result = await executeRemoveFromCart(server, body);
        return jsonResponse(result);
      } catch (error) {
        const mapped = mapRouteError(error, "removeFromCart", "Remove from cart failed");
        return errorResponse(mapped.message, mapped.status);
      }
    },

    async updateCartQuantity(req: IncomingMessage): Promise<HandlerResponse> {
      try {
        const body = await readJsonBody<UpdateCartQuantityRequest>(req);
        const result = await executeUpdateCartQuantity(server, body);
        return jsonResponse(result);
      } catch (error) {
        const mapped = mapRouteError(error, "updateCartQuantity", "Update cart quantity failed");
        return errorResponse(mapped.message, mapped.status);
      }
    },

    async setCartAddresses(req: IncomingMessage): Promise<HandlerResponse> {
      try {
        const body = await readJsonBody<SetCartAddressesRequest>(req);
        return jsonResponse(await executeSetCartAddresses(server, body));
      } catch (error) {
        const mapped = mapRouteError(error, "setCartAddresses", "Set cart addresses failed");
        return errorResponse(mapped.message, mapped.status);
      }
    },

    async getShippingMethods(req: IncomingMessage): Promise<HandlerResponse> {
      try {
        const query = parseRequestQuery(req);
        return jsonResponse(
          await executeGetShippingMethods(server, {
            anonymousId: query.anonymousId,
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
        return errorResponse(mapped.message, mapped.status);
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
        return errorResponse(mapped.message, mapped.status);
      }
    },

    async createOrder(req: IncomingMessage): Promise<HandlerResponse> {
      try {
        const body = await readJsonBody<CreateOrderRequest>(req);
        return jsonResponse(await executeCreateOrder(server, body));
      } catch (error) {
        const mapped = mapRouteError(error, "createOrder", "Create order failed");
        return errorResponse(mapped.message, mapped.status);
      }
    },

    async login(req: IncomingMessage): Promise<HandlerResponse> {
      try {
        const body = await readJsonBody<CartLoginRequest>(req);
        const result = await executeLogin(server, body);
        return jsonResponse(result);
      } catch (error) {
        const mapped = mapRouteError(error, "login", "Login failed");
        return errorResponse(mapped.message, mapped.status);
      }
    },

    async logout(): Promise<HandlerResponse> {
      try {
        const result = await executeLogout();
        return jsonResponse(result);
      } catch (error) {
        const mapped = mapRouteError(error, "logout", "Logout failed");
        return errorResponse(mapped.message, mapped.status);
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
