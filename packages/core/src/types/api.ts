/**
 * HTTP wire contract of the host API (`@commerce-ai-tool/server`): request bodies, multipart
 * fields and response bodies shared by the server handlers and the widgets. Types only, so the
 * file is safe to export from the browser-safe `./client` entry.
 */
import type {
  CartSnapshot,
  CustomerSnapshot,
  InterpretedSearchFilters,
  OrderSnapshot,
  PaymentMethodOption,
  PaymentSnapshot,
  ShippingMethodSnapshot,
  SuggestedFacet,
  VoiceSearchResult,
} from "./index.js";

/** Machine-readable error category returned by the host API next to the human-readable `error` text. */
export type ApiErrorCode =
  | "VALIDATION"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "PAYLOAD_TOO_LARGE"
  | "INVALID_CREDENTIALS"
  | "SESSION_INVALID"
  | "NOT_FOUND"
  | "CART_NOT_FOUND"
  | "ORDER_NOT_FOUND"
  | "CART_ACCESS_DENIED"
  | "MISSING_PRICE"
  | "CHECKOUT_INCOMPLETE"
  | "PAYMENT_DECLINED"
  | "PAYMENT_NOT_CONFIGURED"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "UPSTREAM_UNAVAILABLE"
  | "INTERNAL";

/** JSON body of every non-2xx response from the host API. */
export interface ApiErrorBody {
  error: string;
  code: ApiErrorCode;
  requestId?: string;
}

/**
 * JSON body of `POST /search`. A refinement (`refineQuery`) also needs the previous
 * `searchTerms`. `facetSelections` is optional and additive: older widgets omit it.
 */
export interface SearchRequestBody {
  query: string;
  queryLocale?: string;
  catalogLocale?: string;
  /** @deprecated Use queryLocale */
  locale?: string;
  /** Clamped to 1..100 by the server. */
  limit?: number;
  /** Filters echoed from the previous `meta.appliedFilters`, chip selections included. */
  filters?: InterpretedSearchFilters;
  searchTerms?: string[];
  sort?: "relevance" | "price_asc" | "price_desc";
  refineQuery?: string;
  includeFacets?: boolean;
  suggestedFacets?: SuggestedFacet[];
  enableMissions?: boolean;
  /**
   * Client-generated, non-personal id that groups requests into a Langfuse session: 1 to 200
   * characters from `[A-Za-z0-9._:-]` (a UUID qualifies). An id outside that charset or length is
   * silently dropped (the request is not rejected; its traces just are not grouped).
   */
  widgetSessionId?: string;
  /**
   * Facet chips the shopper selected: `SearchFacetGroup.id` (`categories`, `price`, an attribute
   * name) to the selected `SearchFacetBucket.key` values. When present, the server sends every
   * listed group to Product Search `postFilter` (counts of the group stay visible for
   * multi-select) and does not treat its keys as model constraints. When absent, only the
   * `categories` group is sent to `postFilter`. Bounded: at most 20 groups, 20 values per group,
   * 100-character group ids and 200-character values; anything else is a 400 `VALIDATION`.
   *
   * Only the group keys are used: the concrete filter values still come from the single-valued
   * `filters`, so the listed values are not what narrows the search. A group with an empty array
   * is not a chip. `{}` means a new-style request with no chips: it is not the same as omitting
   * the field, because `categories` is then not sent to `postFilter` either (and the cache key
   * differs from the field-absent form).
   */
  facetSelections?: Record<string, string[]>;
}

/** JSON body of `POST /search/suggestions`. */
export interface SuggestionsRequestBody {
  query: string;
  queryLocale?: string;
  catalogLocale?: string;
  /** @deprecated Use queryLocale */
  locale?: string;
  /** Clamped to 1..20 by the server. */
  limit?: number;
}

/**
 * Multipart text fields of `POST /search/image` (next to the `file` part). Multipart fields are
 * strings: `limit` is a decimal number, `enableMissions` is `"true"` or `"false"`.
 */
export interface ImageSearchRequest {
  queryLocale?: string;
  catalogLocale?: string;
  /** @deprecated Use queryLocale */
  locale?: string;
  limit?: string;
  enableMissions?: string;
  widgetSessionId?: string;
}

/**
 * Multipart text fields of `POST /search/voice` (next to the `file` part). `enableTts` defaults
 * to on (anything but `"false"`), `blockingTts` is on only for `"true"`.
 */
export interface VoiceSearchRequest extends ImageSearchRequest {
  enableTts?: string;
  blockingTts?: string;
}

/** JSON body of `POST /tts`. */
export interface TtsRequestBody {
  text: string;
}

/**
 * Response of `POST /search/voice`. `ttsPending` is true while `ttsText` has no `audioSummary`
 * yet, so the widget fetches the audio from `/tts`.
 */
export type VoiceSearchResponse = VoiceSearchResult & {
  ttsText?: string;
  audioSummary?: string;
  ttsPending: boolean;
};

/** Response of the cart read and mutation routes (`GET /cart`, `POST /cart/add`, ...). */
export interface CartResponse {
  cart: CartSnapshot | null;
}

/** Response of `POST /cart/login`. `sessionToken` is absent on `POST /cart/logout`. */
export interface CartAuthResponse extends CartResponse {
  customer: CustomerSnapshot | null;
  sessionToken?: string;
}

/** Response of `GET /cart/shipping-methods`. */
export interface ShippingMethodsResponse {
  shippingMethods: ShippingMethodSnapshot[];
}

/** Response of `GET /cart/payment-methods`. */
export interface PaymentMethodsResponse {
  paymentMethods: PaymentMethodOption[];
}

/** Response of `POST /cart/payment`. */
export interface AuthorizePaymentResponse {
  payment: PaymentSnapshot;
  cart: CartSnapshot;
}

/** Response of `POST /cart/order`. */
export interface OrderResponse {
  order: OrderSnapshot;
}

/** Response of `GET /orders`: `order` with an `orderNumber`, `orders` without one. */
export interface GetOrderResponse {
  order?: OrderSnapshot;
  orders?: OrderSnapshot[];
}
