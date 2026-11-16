/**
 * Runtime constants shared across the core. `types/` holds types only; anything with a runtime
 * value lives here and is re-exported from the package entry points where it is public.
 */

/** Default step timeouts for the search pipelines; `config.timeouts` overrides them per key. */
export const DEFAULT_TIMEOUTS = {
  aiTextMs: 15_000,
  aiVoiceAudioMs: 20_000,
  aiImageMs: 15_000,
  commercetoolsMs: 8_000,
  commercetoolsSuggestMs: 3_000,
} as const;

/** Autocomplete input bounds (`suggestByText`). */
export const SUGGESTIONS_MIN_PREFIX_LENGTH = 2;
export const SUGGESTIONS_DEFAULT_LIMIT = 8;
export const SUGGESTIONS_MAX_LIMIT = 20;

/** HMAC cart session header for GET /cart — never send the token in the query string. */
export const CART_SESSION_HEADER = "x-commerce-ai-cart-session";

/**
 * Guest anonymousId header for GET reads (cart, shipping methods, payment methods, orders).
 * The id is the guest's only credential, so it must not travel in a URL that proxies log.
 */
export const ANONYMOUS_ID_HEADER = "x-commerce-ai-anonymous-id";

/** Shape of the order numbers the widgets and the core generate: `cat-<uuid>`. */
export const ORDER_NUMBER_PATTERN =
  /^cat-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Upper bound for a single add-to-cart line quantity (mission add-all and batch add). */
export const MAX_LINE_ITEM_QUANTITY = 99;
