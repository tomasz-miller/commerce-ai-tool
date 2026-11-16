import {
  type AddItemsToCartRequest,
  type AddToCartRequest,
  type ApiErrorBody,
  type ApiErrorCode,
  type AuthorizePaymentRequest,
  type AuthorizePaymentResponse,
  type CartAuthResponse,
  type CartLoginRequest,
  type CartMutationRequest,
  type CartResponse,
  type CreateOrderRequest,
  type GetCartRequest,
  type GetOrderRequest,
  type GetOrderResponse,
  type ImageSearchRequest,
  type ImageSearchResult,
  type ListOrdersRequest,
  type OrderResponse,
  type PaymentMethodsResponse,
  type ResolvedFacetSchema,
  type SearchRequestBody,
  type SearchResult,
  type SetCartAddressesRequest,
  type SetShippingMethodRequest,
  type ShippingMethodsResponse,
  type SuggestionsRequestBody,
  type SuggestionsResult,
  type TtsRequestBody,
  type UpdateCartQuantityRequest,
  type VoiceSearchRequest,
  type VoiceSearchResponse,
} from "../types/index.js";
import {
  ANONYMOUS_ID_HEADER,
  CART_SESSION_HEADER,
} from "../config/defaults.js";
import { recordedAudioFile } from "./audio.js";

/** Keyed by the union, so adding an `ApiErrorCode` without listing it here fails to compile. */
const API_ERROR_CODES: Record<ApiErrorCode, true> = {
  VALIDATION: true,
  UNSUPPORTED_MEDIA_TYPE: true,
  PAYLOAD_TOO_LARGE: true,
  INVALID_CREDENTIALS: true,
  SESSION_INVALID: true,
  NOT_FOUND: true,
  CART_NOT_FOUND: true,
  ORDER_NOT_FOUND: true,
  CART_ACCESS_DENIED: true,
  MISSING_PRICE: true,
  CHECKOUT_INCOMPLETE: true,
  PAYMENT_DECLINED: true,
  PAYMENT_NOT_CONFIGURED: true,
  RATE_LIMITED: true,
  TIMEOUT: true,
  UPSTREAM_UNAVAILABLE: true,
  INTERNAL: true,
};

function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === "string" && Object.hasOwn(API_ERROR_CODES, value);
}

/**
 * Every non-2xx response of the host API (and a 2xx with an unreadable body). `code` is the
 * stable category to branch on; `message` is the server's developer-facing text and is not meant
 * for the UI: render {@link messageForError} instead.
 */
export class CommerceAIApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly requestId?: string;

  constructor(init: { status: number; code: ApiErrorCode; message: string; requestId?: string }) {
    super(init.message);
    this.name = "CommerceAIApiError";
    this.status = init.status;
    this.code = init.code;
    if (init.requestId !== undefined) {
      this.requestId = init.requestId;
    }
  }
}

export interface CommerceAIApiClientOptions {
  /** Host API base URL, absolute or relative (`/api/commerce-ai`). Every request is built from it. */
  baseUrl: string;
  /**
   * Defaults to the global `fetch`, resolved on each call. The session token and guest id are
   * custom headers, which `fetch` keeps across a cross-origin redirect: a host whose API may
   * redirect to another origin should inject a fetch that sets `redirect: "error"`.
   */
  fetch?: typeof fetch;
  /** Customer session token. Sent to `baseUrl` only: a header on reads, a body field on mutations. */
  getSessionToken?: () => string | null;
  /** Guest id, used when there is no session token. */
  getAnonymousId?: () => string | null;
}

export interface CommerceAIRequestOptions {
  signal?: AbortSignal;
}

/** Identity is added by the client from `getSessionToken` / `getAnonymousId`. */
type WithoutIdentity<T> = Omit<T, "anonymousId" | "customerId" | "sessionToken">;

/**
 * A caller-initiated cancellation or timeout (`AbortController.abort()`, `AbortSignal.timeout()`):
 * it must reach the caller as is, never be turned into an API error.
 */
function isCancellation(error: unknown, signal: AbortSignal | null | undefined): boolean {
  if (signal?.aborted) {
    return true;
  }
  const name = typeof error === "object" && error !== null ? (error as { name?: unknown }).name : undefined;
  return name === "AbortError" || name === "TimeoutError";
}

function stripTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === "/") {
    end -= 1;
  }
  return value.slice(0, end);
}

async function toApiError(
  response: Response,
  signal: AbortSignal | null | undefined,
): Promise<CommerceAIApiError> {
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    if (isCancellation(error, signal)) {
      throw error;
    }
    // A proxy or CDN error page, not the host API: the status is all there is.
    return new CommerceAIApiError({
      status: response.status,
      code: "INTERNAL",
      message: `Request failed with status ${response.status}`,
    });
  }

  const parsed: Partial<ApiErrorBody> = body !== null && typeof body === "object" ? body : {};
  return new CommerceAIApiError({
    status: response.status,
    code: isApiErrorCode(parsed.code) ? parsed.code : "INTERNAL",
    message:
      typeof parsed.error === "string" && parsed.error
        ? parsed.error
        : `Request failed with status ${response.status}`,
    requestId: typeof parsed.requestId === "string" ? parsed.requestId : undefined,
  });
}

async function readJson<T>(response: Response, signal: AbortSignal | null | undefined): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch (error) {
    if (isCancellation(error, signal)) {
      throw error;
    }
    throw new CommerceAIApiError({
      status: response.status,
      code: "INTERNAL",
      message: "The response body is not valid JSON",
    });
  }
}

function appendFields(form: FormData, fields: object): void {
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === "string" && value !== "") {
      form.append(key, value);
    }
  }
}

function withQuery(path: string, params: Record<string, string | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      query.set(key, value);
    }
  }
  const serialized = query.toString();
  return serialized ? `${path}?${serialized}` : path;
}

/**
 * Typed `fetch` client for the host API routes of `@commerce-ai-tool/server`. Framework-free:
 * React hooks and Angular services wrap it with their own state. Request and response shapes
 * are the wire types in `types/api.ts`; failures throw {@link CommerceAIApiError}.
 */
export function createCommerceAIApiClient(options: CommerceAIApiClientOptions) {
  const baseUrl = stripTrailingSlashes(options.baseUrl);

  const send = async (path: string, init: RequestInit): Promise<Response> => {
    const doFetch = options.fetch ?? globalThis.fetch;
    const response = await doFetch(`${baseUrl}${path}`, init);
    if (!response.ok) {
      throw await toApiError(response, init.signal);
    }
    return response;
  };

  const sendJson = async <T>(path: string, init: RequestInit): Promise<T> =>
    readJson<T>(await send(path, init), init.signal);

  const post = <T>(path: string, body: unknown, request?: CommerceAIRequestOptions): Promise<T> =>
    sendJson<T>(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: request?.signal,
    });

  const postForm = <T>(path: string, form: FormData, request?: CommerceAIRequestOptions): Promise<T> =>
    // No Content-Type: the browser sets the multipart boundary.
    sendJson<T>(path, { method: "POST", body: form, signal: request?.signal });

  /** Reads carry identity in a header, never in a URL that proxies and CDNs log. */
  const readIdentityHeaders = (): Record<string, string> => {
    const token = options.getSessionToken?.();
    if (token) {
      return { [CART_SESSION_HEADER]: token };
    }
    const anonymousId = options.getAnonymousId?.();
    return anonymousId ? { [ANONYMOUS_ID_HEADER]: anonymousId } : {};
  };

  const get = <T>(path: string, request?: CommerceAIRequestOptions): Promise<T> =>
    sendJson<T>(path, { headers: readIdentityHeaders(), signal: request?.signal });

  /** Mutation bodies identify the shopper with `sessionToken` or `anonymousId`, as the server expects. */
  const mutate = <T>(path: string, body: object, request?: CommerceAIRequestOptions): Promise<T> =>
    post<T>(
      path,
      {
        anonymousId: options.getAnonymousId?.() ?? undefined,
        sessionToken: options.getSessionToken?.() ?? undefined,
        ...body,
      },
      request,
    );

  return {
    search: (body: SearchRequestBody, request?: CommerceAIRequestOptions) =>
      post<SearchResult>("/search", body, request),

    suggest: (body: SuggestionsRequestBody, request?: CommerceAIRequestOptions) =>
      post<SuggestionsResult>("/search/suggestions", body, request),

    facetSchema: (request?: CommerceAIRequestOptions) =>
      sendJson<ResolvedFacetSchema>("/search/facet-schema", { signal: request?.signal }),

    /** `audio` is a `MediaRecorder` result; the part is named and typed after its real container. */
    searchByVoice: (audio: Blob, fields: VoiceSearchRequest = {}, request?: CommerceAIRequestOptions) => {
      const form = new FormData();
      form.append("audio", recordedAudioFile(audio, audio.type));
      appendFields(form, fields);
      return postForm<VoiceSearchResponse>("/search/voice", form, request);
    },

    searchByImage: (image: Blob, fields: ImageSearchRequest = {}, request?: CommerceAIRequestOptions) => {
      const form = new FormData();
      form.append("image", image, image instanceof File ? image.name : "image");
      appendFields(form, fields);
      return postForm<ImageSearchResult>("/search/image", form, request);
    },

    /** Speech audio (`audio/mpeg`) for `body.text`. */
    tts: async (body: TtsRequestBody, request?: CommerceAIRequestOptions): Promise<Blob> => {
      const response = await send("/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: request?.signal,
      });
      return response.blob();
    },

    cart: {
      get: (query: Pick<GetCartRequest, "catalogLocale"> = {}, request?: CommerceAIRequestOptions) =>
        get<CartResponse>(withQuery("/cart", { catalogLocale: query.catalogLocale }), request),

      add: (body: WithoutIdentity<AddToCartRequest>, request?: CommerceAIRequestOptions) =>
        mutate<CartResponse>("/cart/add", body, request),

      addItems: (body: WithoutIdentity<AddItemsToCartRequest>, request?: CommerceAIRequestOptions) =>
        mutate<CartResponse>("/cart/add-items", body, request),

      remove: (body: WithoutIdentity<CartMutationRequest>, request?: CommerceAIRequestOptions) =>
        mutate<CartResponse>("/cart/remove", body, request),

      updateQuantity: (body: WithoutIdentity<UpdateCartQuantityRequest>, request?: CommerceAIRequestOptions) =>
        mutate<CartResponse>("/cart/update-quantity", body, request),

      /** Merges the guest cart into the customer's. The response carries the new `sessionToken`. */
      login: (body: Omit<CartLoginRequest, "anonymousId">, request?: CommerceAIRequestOptions) =>
        post<CartAuthResponse>(
          "/cart/login",
          { anonymousId: options.getAnonymousId?.() ?? undefined, ...body },
          request,
        ),

      /** The token header lets the host run its `cartSession.onLogout` hook. */
      logout: (request?: CommerceAIRequestOptions) => {
        const token = options.getSessionToken?.();
        return sendJson<CartAuthResponse>("/cart/logout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { [CART_SESSION_HEADER]: token } : {}),
          },
          body: "{}",
          signal: request?.signal,
        });
      },

      addresses: (body: WithoutIdentity<SetCartAddressesRequest>, request?: CommerceAIRequestOptions) =>
        mutate<CartResponse>("/cart/addresses", body, request),

      shippingMethods: (
        query: Pick<GetCartRequest, "catalogLocale"> & { cartId?: string } = {},
        request?: CommerceAIRequestOptions,
      ) =>
        get<ShippingMethodsResponse>(
          withQuery("/cart/shipping-methods", {
            cartId: query.cartId,
            catalogLocale: query.catalogLocale,
          }),
          request,
        ),

      setShippingMethod: (body: WithoutIdentity<SetShippingMethodRequest>, request?: CommerceAIRequestOptions) =>
        mutate<CartResponse>("/cart/shipping-method", body, request),

      paymentMethods: (
        query: Pick<GetCartRequest, "catalogLocale"> & { cartId?: string } = {},
        request?: CommerceAIRequestOptions,
      ) =>
        get<PaymentMethodsResponse>(
          withQuery("/cart/payment-methods", {
            cartId: query.cartId,
            catalogLocale: query.catalogLocale,
          }),
          request,
        ),

      pay: (body: WithoutIdentity<AuthorizePaymentRequest>, request?: CommerceAIRequestOptions) =>
        mutate<AuthorizePaymentResponse>("/cart/payment", body, request),

      /** Places the order for the cart. Reuse one `orderNumber` across retries so it stays idempotent. */
      order: (body: WithoutIdentity<CreateOrderRequest>, request?: CommerceAIRequestOptions) =>
        mutate<OrderResponse>("/cart/order", body, request),
    },

    orders: {
      get: (
        query: Required<Pick<GetOrderRequest, "orderNumber">> & Pick<GetOrderRequest, "catalogLocale">,
        request?: CommerceAIRequestOptions,
      ) =>
        get<GetOrderResponse>(
          withQuery("/orders", { orderNumber: query.orderNumber, catalogLocale: query.catalogLocale }),
          request,
        ),

      list: (query: Pick<ListOrdersRequest, "catalogLocale"> = {}, request?: CommerceAIRequestOptions) =>
        get<GetOrderResponse>(withQuery("/orders", { catalogLocale: query.catalogLocale }), request),
    },
  };
}

export type CommerceAIApiClient = ReturnType<typeof createCommerceAIApiClient>;
