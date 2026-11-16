import type { PaymentProvider } from "../payments/types.js";

export type { PaymentMethodOption } from "../payments/types.js";
export type * from "./api.js";

export type ThemeMode = "auto" | "light" | "dark";

export type AIProviderName = "openrouter" | "bedrock";

export type VoiceMode = "openrouter-audio" | "elevenlabs-stt";

export interface SearchCacheConfig {
  ttlMs?: number;
  maxEntries?: number;
}

export interface FacetConfig {
  enabled?: boolean;
  schemaTtlMs?: number;
  include?: string[];
  exclude?: string[];
  maxAttributes?: number;
}

export interface SearchTimeoutsConfig {
  aiTextMs?: number;
  aiVoiceAudioMs?: number;
  aiImageMs?: number;
  commercetoolsMs?: number;
  commercetoolsSuggestMs?: number;
  elevenLabsTtsMs?: number;
}

export interface CommercetoolsConfig {
  projectKey: string;
  clientId: string;
  clientSecret: string;
  region: string;
  /**
   * OAuth scopes requested for the access token, in the `scope:projectKey` form (for example
   * `view_published_products:my-project`). When unset or empty the scope parameter is omitted and
   * the token gets exactly the scopes of the API client created in the Merchant Center. Create
   * that client with the least-privilege list in docs/CONFIGURATION.md. Env: `CTP_SCOPES`.
   */
  scopes?: string[];
  /**
   * Opt in to the deprecated Product Projection Search fallback when Product Search is not
   * enabled on the project. Default `false` since 3.0.0: the search then fails with an error that
   * says to enable Product Search. `true` allows the fallback, with a one-time deprecation
   * warning. Env: `CAT_LEGACY_PRODUCT_PROJECTION_SEARCH`.
   */
  legacyProductProjectionSearch?: boolean;
}

export interface OpenRouterConfig {
  apiKey: string;
  model?: string;
  visionModel?: string;
  /** Audio-capable model for direct voice search (OpenRouter input_audio). */
  voiceModel?: string;
  /**
   * Use OpenRouter `json_schema` (strict) for structured interpretation.
   * Falls back to `json_object` when the model rejects json_schema.
   * Default: true.
   */
  jsonSchema?: boolean;
}

export interface BedrockConfig {
  region: string;
  modelId?: string;
  visionModelId?: string;
}

export interface AIConfig {
  provider: AIProviderName;
  openrouter?: OpenRouterConfig;
  bedrock?: BedrockConfig;
}

export interface ElevenLabsConfig {
  apiKey: string;
  sttModel?: string;
  ttsVoiceId?: string;
  ttsModel?: string;
}

export interface CommerceAIDefaults {
  /** Language products are indexed in within commercetools */
  catalogLocale?: string;
  /** @deprecated Use catalogLocale */
  locale?: string;
  storeKey?: string;
  limit?: number;
  currency?: string;
  /** ISO country code for cart and product-card price selection (optional). */
  country?: string;
}

/**
 * Server-side price-scope policy for carts. When set, the host ignores client-supplied
 * `currency` and `country` values outside the policy and falls back to `defaults`.
 */
export interface CartPolicy {
  /** ISO 3166-1 alpha-2 codes a cart may use for price selection and shipping. */
  allowedCountries?: string[];
  /** ISO 4217 currency per country code, for example `{ DE: "EUR", CH: "CHF" }`. */
  currencyByCountry?: Record<string, string>;
}

export interface PaymentConfig {
  provider?: PaymentProvider;
  /** Block order creation without a successful authorization. Defaults to true when a provider is set. */
  requiredForOrder?: boolean;
}

export interface LangfuseConfig {
  /** Derived from LANGFUSE_PUBLIC_KEY + LANGFUSE_SECRET_KEY when loading from env. */
  enabled?: boolean;
  /**
   * Fetch system prompts from Langfuse at runtime.
   * Applied via `configureLangfusePrompts` when creating the search orchestrator
   * (or set `LANGFUSE_PROMPTS=true` when config omits this field).
   * Local catalog remains the fallback and the source of truth for evals.
   */
  promptsEnabled?: boolean;
  /** Langfuse prompt label (default `production`). From LANGFUSE_PROMPT_LABEL or this field. */
  promptLabel?: string;
  /** Client-side prompt cache TTL in seconds (default 60). From LANGFUSE_PROMPT_CACHE_TTL_SECONDS or this field. */
  promptCacheTtlSeconds?: number;
  /**
   * Upper bound in milliseconds for one prompt fetch (default 2000). On timeout or error the local prompt
   * is used and the fetch is not retried for 30 s. From LANGFUSE_PROMPT_FETCH_TIMEOUT_MS or this field.
   */
  promptFetchTimeoutMs?: number;
  /** Retries of a failed prompt fetch inside the SDK (default 0; `0` disables retries). From LANGFUSE_PROMPT_MAX_RETRIES or this field. */
  promptMaxRetries?: number;
}

export interface VoiceConfig {
  /**
   * Opt-in. When true, the spoken summary (`ttsText`) is written by the LLM
   * (`summarizeVoiceResults`, one extra call per voice search). Default: the deterministic
   * `buildTtsSummaryFallback` sentence, no LLM call. From `CAT_VOICE_LLM_SUMMARY=true`.
   */
  llmSummary?: boolean;
}

export interface MissionsConfig {
  /** Opt-in. When true, every fresh text search also runs mission decomposition. */
  enabled?: boolean;
  /** Maximum product intents kept from a decomposed mission. Default 5. */
  maxIntents?: number;
  /** Product Search limit per intent. Default 4. */
  perIntentLimit?: number;
  /** Minimum AI confidence (0–1) required to keep a mission. Default 0.6. */
  minConfidence?: number;
}

/** Customer cart session token settings. */
export interface CartSessionConfig {
  /**
   * HMAC secret for customer cart session tokens. From `CAT_CART_SESSION_SECRET` when loading from
   * env. Whenever it is set it must be at least 32 bytes (UTF-8, trimmed), in every environment.
   * It may be omitted only when `NODE_ENV` is `development` or `test`, which then use a random
   * per-process secret (sessions end on restart) with a warning; with any other `NODE_ENV`,
   * including unset, `createCommerceAIServer` throws. The commercetools client secret is never
   * used.
   */
  secret?: string;
  /**
   * Called for every validly signed, unexpired session token before it is trusted (cart,
   * checkout, payment, orders). Return `true` to reject the token with 401 `SESSION_INVALID`.
   * `iat` is the token's issue time in seconds. Errors thrown here fail the request (500).
   */
  isRevoked?: (payload: { customerId: string; iat: number }) => boolean | Promise<boolean>;
  /**
   * Called by `POST /cart/logout` when the request carries a valid, unrevoked session token in
   * the `x-commerce-ai-cart-session` header, for example to add the token to a denylist that
   * `isRevoked` reads. Not called for logout without a token or with an invalid one.
   */
  onLogout?: (payload: { customerId: string; iat: number; exp: number }) => void | Promise<void>;
}

export interface CommerceAIConfig {
  commercetools: CommercetoolsConfig;
  ai: AIConfig;
  elevenlabs?: ElevenLabsConfig;
  defaults?: CommerceAIDefaults;
  /**
   * Locales the host accepts from clients (BCP 47, for example `["en-GB", "de-DE"]`).
   * Enforced by `@commerce-ai-tool/server` on catalog locales only: any other `catalogLocale`
   * falls back to the default. `queryLocale` (the shopper's language) is never restricted by this
   * list. Invalid entries are dropped with a warning. When omitted, only well-formed locales are
   * required.
   */
  supportedLocales?: string[];
  voiceMode?: VoiceMode;
  /** Voice search options. See {@link VoiceConfig}. */
  voice?: VoiceConfig;
  cache?: SearchCacheConfig;
  timeouts?: SearchTimeoutsConfig;
  facets?: FacetConfig;
  langfuse?: LangfuseConfig;
  payments?: PaymentConfig;
  missions?: MissionsConfig;
  /**
   * Restricts the cart currency and country to server policy. Unset: body values are used
   * and fall back to `defaults`. See docs/CART-AND-CHECKOUT.md.
   */
  cartPolicy?: CartPolicy;
  /** Customer cart session settings. See {@link CartSessionConfig}. */
  cartSession?: CartSessionConfig;
}

export interface ProductCard {
  id: string;
  key?: string;
  name: string;
  description?: string;
  imageUrl?: string;
  /**
   * SKU used for add-to-cart: the first matching variant when Product Search matched only some
   * variants of the product (for example the red variant for a red filter), else the master
   * variant. `imageUrl` and `price` come from the same variant.
   */
  sku?: string;
  /** Id of the same variant as `sku` — fallback when `sku` is missing. */
  variantId?: number;
  price?: {
    amount: number;
    currency: string;
    formatted: string;
  };
  slug?: string;
}

export interface MoneyAmount {
  amount: number;
  currency: string;
  formatted: string;
}

export interface CartLineItemSnapshot {
  id: string;
  name: string;
  sku?: string;
  productId: string;
  quantity: number;
  imageUrl?: string;
  price?: MoneyAmount;
  totalPrice?: MoneyAmount;
}

export interface CheckoutAddress {
  firstName: string;
  lastName: string;
  streetName: string;
  additionalStreetInfo?: string;
  postalCode: string;
  city: string;
  region?: string;
  country: string;
  email?: string;
  phone?: string;
}

export interface ShippingMethodSnapshot {
  id: string;
  name: string;
  description?: string;
  price?: MoneyAmount;
}

export interface PaymentSnapshot {
  id: string;
  key?: string;
  interfaceId?: string;
  paymentInterface: string;
  method: string;
  status: "authorized" | "pending" | "failed";
  amount: MoneyAmount;
  clientData?: Record<string, string>;
}

export interface DeliverySnapshot {
  id: string;
  trackingId?: string;
  carrier?: string;
  provider?: string;
}

/** Client-safe cart shape — never the raw commercetools Cart object. */
export interface CartSnapshot {
  id: string;
  version: number;
  anonymousId?: string;
  customerId?: string;
  lineItems: CartLineItemSnapshot[];
  totalPrice: MoneyAmount;
  totalQuantity: number;
  shippingAddress?: CheckoutAddress;
  billingAddress?: CheckoutAddress;
  shippingMethod?: ShippingMethodSnapshot;
  payments?: PaymentSnapshot[];
}

export interface OrderSnapshot {
  id: string;
  orderNumber?: string;
  orderState: string;
  createdAt?: string;
  paymentState?: string;
  shipmentState?: string;
  customerEmail?: string;
  totalPrice: MoneyAmount;
  lineItems: CartLineItemSnapshot[];
  shippingAddress?: CheckoutAddress;
  billingAddress?: CheckoutAddress;
  shippingMethod?: ShippingMethodSnapshot;
  payments?: PaymentSnapshot[];
  deliveries?: DeliverySnapshot[];
}

/** Public customer identity — never includes credentials. */
export interface CustomerSnapshot {
  id: string;
  email: string;
}

export interface CartLoginRequest {
  email: string;
  password: string;
  anonymousId?: string;
  cartId?: string;
  catalogLocale?: string;
}

export interface CartLoginResult {
  cart: CartSnapshot | null;
  customer: CustomerSnapshot;
}

export interface AddToCartLineItem {
  sku?: string;
  productId?: string;
  variantId?: number;
  quantity?: number;
}

export interface AddToCartRequest {
  anonymousId?: string;
  customerId?: string;
  sku?: string;
  productId?: string;
  variantId?: number;
  quantity?: number;
  currency?: string;
  country?: string;
  catalogLocale?: string;
  /** When set, add to this cart instead of looking up by anonymousId / customerId. */
  cartId?: string;
  sessionToken?: string;
}

export interface AddItemsToCartRequest {
  anonymousId?: string;
  customerId?: string;
  items: AddToCartLineItem[];
  currency?: string;
  country?: string;
  catalogLocale?: string;
  cartId?: string;
  sessionToken?: string;
}

export interface CartMutationRequest {
  anonymousId?: string;
  customerId?: string;
  lineItemId: string;
  cartId?: string;
  catalogLocale?: string;
  sessionToken?: string;
}

export interface UpdateCartQuantityRequest extends CartMutationRequest {
  quantity: number;
}

export interface GetCartRequest {
  anonymousId?: string;
  customerId?: string;
  catalogLocale?: string;
  sessionToken?: string;
}

export interface CheckoutRequest {
  anonymousId?: string;
  customerId?: string;
  cartId?: string;
  catalogLocale?: string;
  sessionToken?: string;
}

export interface SetCartAddressesRequest extends CheckoutRequest {
  shippingAddress: CheckoutAddress;
  billingAddress?: CheckoutAddress;
}

export interface SetShippingMethodRequest extends CheckoutRequest {
  shippingMethodId: string;
}

export interface CreateOrderRequest extends CheckoutRequest {
  orderNumber?: string;
}

export interface AuthorizePaymentRequest extends CheckoutRequest {
  method: string;
  orderNumber?: string;
}

export interface GetOrderRequest {
  orderNumber?: string;
  anonymousId?: string;
  customerId?: string;
  catalogLocale?: string;
  sessionToken?: string;
}

export interface ListOrdersRequest {
  anonymousId?: string;
  customerId?: string;
  catalogLocale?: string;
  sessionToken?: string;
  limit?: number;
}

export type SearchRelaxationLevel = "none" | "drop_soft_filters" | "primary_any_match";

export interface SearchMeta {
  total: number;
  limit: number;
  offset: number;
  /** @deprecated Use catalogLocale */
  locale: string;
  catalogLocale: string;
  queryLocale: string;
  queryInterpretation?: string;
  searchTerms?: string[];
  /** Catalog-language phrase closest to the user's intent, when the model supplied one. */
  primaryTerm?: string;
  appliedFilters?: InterpretedSearchFilters;
  /**
   * How far Product Search was relaxed after an empty first result.
   * Omitted when no relaxation ran (`none`).
   */
  relaxation?: SearchRelaxationLevel;
  sort?: "relevance" | "price_asc" | "price_desc";
  schemaEtag?: string;
  /** Per-step durations in milliseconds (dev / CAT_DEBUG only) */
  timings?: Record<string, number>;
  /** Total pipeline duration in milliseconds (dev / CAT_DEBUG only) */
  totalMs?: number;
  /**
   * Active OpenTelemetry / Langfuse trace id when Langfuse is enabled or CAT_DEBUG=true.
   * Non-stable for client contracts — intended for local/dev linking.
   */
  traceId?: string;
}

export interface SearchResult {
  products: ProductCard[];
  meta: SearchMeta;
  facets?: SearchFacetGroup[];
  suggestedFacets?: SuggestedFacet[];
  facetSchema?: FacetAttributeDefinition[];
  /** Present when a compound shopping mission was executed. */
  mission?: MissionSearchResult;
}

export interface SuggestionsRequest extends SearchLocaleOptions {
  query: string;
  limit?: number;
  /** Aborts the commercetools and AI steps that have not finished yet. */
  signal?: AbortSignal;
}

export interface SuggestionsResult {
  suggestions: string[];
  /**
   * True when this request invoked AI `suggestSearchTerms` (not a cache hit).
   * Used by the server to flush Langfuse on serverless hosts.
   */
  aiFallbackUsed?: boolean;
}

export interface TextSearchRequest {
  query: string;
  /** Language of the user query (AI input) */
  queryLocale?: string;
  /** Language products are indexed in commercetools */
  catalogLocale?: string;
  /** @deprecated Use queryLocale */
  locale?: string;
  limit?: number;
  offset?: number;
  filters?: InterpretedSearchFilters;
  searchTerms?: string[];
  sort?: "relevance" | "price_asc" | "price_desc";
  refineQuery?: string;
  includeFacets?: boolean;
  /** AI-suggested facets from the active search session (chip refine). */
  suggestedFacets?: SuggestedFacet[];
  /**
   * Facet chips the shopper selected (`SearchFacetGroup.id` to `SearchFacetBucket.key` values).
   * When present, every listed group's key in `filters` goes to Product Search `postFilter`; when
   * absent, only the `categories` group does. See `SearchRequestBody.facetSelections`.
   */
  facetSelections?: Record<string, string[]>;
  /** Per-request override of `CommerceAIConfig.missions.enabled`. */
  enableMissions?: boolean;
  /**
   * Client-generated, non-personal id (at most 200 characters) that groups a widget session's
   * requests into one Langfuse session. Handled by the server adapters; the orchestrator ignores it.
   */
  widgetSessionId?: string;
  /**
   * Aborts the steps that have not finished yet, including in-flight AI calls. Server adapters
   * pass the host request's signal. Never serialised or cached.
   */
  signal?: AbortSignal;
}

export interface SearchLocaleOptions {
  queryLocale?: string;
  catalogLocale?: string;
  /** @deprecated Use queryLocale */
  locale?: string;
}

export interface SearchLocaleContext {
  queryLocale: string;
  catalogLocale: string;
}

export interface VoiceSearchResult extends SearchResult {
  transcript: string;
  enhancedQuery?: string;
}

export interface ImageSearchResult extends SearchResult {
  interpretation: string;
}

/** Standard filter keys returned by AI interpretation (all optional). */
export interface InterpretedSearchFilters {
  color?: string;
  brand?: string;
  category?: string;
  priceMin?: string;
  priceMax?: string;
  [key: string]: string | undefined;
}

export interface InterpretedSearchQuery {
  /**
   * Catalog-language phrase closest to the user's intent.
   * Product Search boosts this phrase above the other `searchTerms`.
   * Kept separate from `searchTerms[0]` because same-language query passthrough
   * prepends the typed query without changing intent priority.
   */
  primaryTerm?: string;
  /**
   * Catalog-language search phrases. Product Search matches any phrase (OR).
   * Each element is a complete phrase (e.g. `"red shoes"`), not a split word.
   * Broad intents may include 3–5 synonym or hyponym phrases.
   */
  searchTerms: string[];
  filters?: InterpretedSearchFilters;
  suggestedFacets?: SuggestedFacet[];
  sort?: "relevance" | "price_asc" | "price_desc";
  interpretation: string;
}

export interface ShoppingIntent {
  /** Stable id for UI keys and selection (`intent-0`, `intent-1`, …). */
  id: string;
  /** Short catalog-language label, e.g. "tennis racket". */
  label: string;
  /** Requested quantity, always >= 1. */
  quantity: number;
  /** Catalog-language phrase closest to this intent, boosted above alternates. */
  primaryTerm?: string;
  searchTerms: string[];
  filters?: InterpretedSearchFilters;
  sort?: "relevance" | "price_asc" | "price_desc";
}

export interface DecomposedShoppingMission {
  isMission: boolean;
  /** 0–1. Missions below the configured minConfidence fall back to standard search. */
  confidence: number;
  intents: ShoppingIntent[];
  interpretation: string;
}

export interface MissionIntentGroup {
  intent: ShoppingIntent;
  products: ProductCard[];
  total: number;
  /** True when this intent's Product Search failed; other groups still render. */
  failed?: boolean;
}

export interface MissionSearchResult {
  intents: MissionIntentGroup[];
  interpretation: string;
}

export type FacetAttributeType = "enum" | "lenum" | "boolean" | "text" | "number";

export interface FacetAttributeDefinition {
  name: string;
  label: string;
  kind: "distinct" | "range";
  attributeType: FacetAttributeType;
  field: string;
  fieldType?: string;
}

export interface ResolvedFacetSchema {
  attributes: FacetAttributeDefinition[];
  systemFacets: Array<"categories" | "price">;
  etag: string;
  resolvedAt: string;
}

export interface SuggestedFacet {
  name: string;
  reason?: string;
}

export interface SearchFacetBucket {
  key: string;
  label: string;
  count: number;
}

export interface SearchFacetGroup {
  id: string;
  label: string;
  type: "distinct" | "range";
  buckets: SearchFacetBucket[];
  selectedKey?: string;
  /**
   * ISO 4217 currency of the search. Set on the `price` group so chip helpers can convert
   * bucket bounds to major units. Pass it as the `currency` argument of
   * `toggleFacetFilter` / `isFacetFilterSelected`.
   */
  currency?: string;
}

export interface SearchSessionState {
  query: string;
  searchTerms: string[];
  appliedFilters: InterpretedSearchFilters;
  suggestedFacets: SuggestedFacet[];
  facetSchema?: FacetAttributeDefinition[];
  schemaEtag?: string;
}

export interface VoiceAudioInterpretation extends InterpretedSearchQuery {
  transcript: string;
  enhancedQuery: string;
}

/** One structured call over an STT transcript: the cleaned query plus the interpreted search. */
export interface VoiceTranscriptInterpretation extends InterpretedSearchQuery {
  enhancedQuery: string;
}
