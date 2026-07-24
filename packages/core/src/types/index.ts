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

export const SUGGESTIONS_MIN_PREFIX_LENGTH = 2;
export const SUGGESTIONS_DEFAULT_LIMIT = 8;
export const SUGGESTIONS_MAX_LIMIT = 20;

export interface CommercetoolsConfig {
  projectKey: string;
  clientId: string;
  clientSecret: string;
  region: string;
  scopes?: string[];
}

export interface OpenRouterConfig {
  apiKey: string;
  model?: string;
  visionModel?: string;
  /** Audio-capable model for direct voice search (OpenRouter input_audio). */
  voiceModel?: string;
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
}

export interface CommerceAIConfig {
  commercetools: CommercetoolsConfig;
  ai: AIConfig;
  elevenlabs?: ElevenLabsConfig;
  defaults?: CommerceAIDefaults;
  voiceMode?: VoiceMode;
  cache?: SearchCacheConfig;
  timeouts?: SearchTimeoutsConfig;
  facets?: FacetConfig;
  langfuse?: LangfuseConfig;
}

export interface ProductCard {
  id: string;
  key?: string;
  name: string;
  description?: string;
  imageUrl?: string;
  price?: {
    amount: number;
    currency: string;
    formatted: string;
  };
  slug?: string;
}

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
  appliedFilters?: InterpretedSearchFilters;
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
}

export interface SuggestionsRequest extends SearchLocaleOptions {
  query: string;
  limit?: number;
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
  searchTerms: string[];
  filters?: InterpretedSearchFilters;
  suggestedFacets?: SuggestedFacet[];
  sort?: "relevance" | "price_asc" | "price_desc";
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

/** @deprecated Use ProductSearchRequest from query-builder / platform-sdk */
export type { ProductSearchRequest as ProductSearchQueryBody } from "@commercetools/platform-sdk";
