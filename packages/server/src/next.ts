import type {
  AddToCartRequest,
  CartLoginRequest,
  CartMutationRequest,
  CommerceAIConfig,
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
  executeGetCart,
  executeLogin,
  executeLogout,
  executeRemoveFromCart,
  executeUpdateCartQuantity,
} from "./cart-actions.js";
import { readCartSessionHeader } from "./cart-session.js";
import {
  clientKeyFromWebHeaders,
  createLoginAttemptLimiter,
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
  removeFromCart: (req: Request) => Promise<Response>;
  updateCartQuantity: (req: Request) => Promise<Response>;
  login: (req: Request) => Promise<Response>;
  logout: () => Promise<Response>;
}

const loginLimiter = createLoginAttemptLimiter();

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
