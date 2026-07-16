export type ThemeMode = "auto" | "light" | "dark";

export type AIProviderName = "openrouter" | "bedrock";

export type VoiceMode = "openrouter-audio" | "elevenlabs-stt";

export interface SearchCacheConfig {
  ttlMs?: number;
  maxEntries?: number;
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

export interface CommerceAIConfig {
  commercetools: CommercetoolsConfig;
  ai: AIConfig;
  elevenlabs?: ElevenLabsConfig;
  defaults?: CommerceAIDefaults;
  voiceMode?: VoiceMode;
  cache?: SearchCacheConfig;
  timeouts?: SearchTimeoutsConfig;
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
  /** Per-step durations in milliseconds (dev / CAT_DEBUG only) */
  timings?: Record<string, number>;
  /** Total pipeline duration in milliseconds (dev / CAT_DEBUG only) */
  totalMs?: number;
}

export interface SearchResult {
  products: ProductCard[];
  meta: SearchMeta;
}

export interface SuggestionsRequest extends SearchLocaleOptions {
  query: string;
  limit?: number;
}

export interface SuggestionsResult {
  suggestions: string[];
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
  sort?: "relevance" | "price_asc" | "price_desc";
  interpretation: string;
}

export interface VoiceAudioInterpretation extends InterpretedSearchQuery {
  transcript: string;
  enhancedQuery: string;
}

/** @deprecated Use ProductSearchRequest from query-builder / platform-sdk */
export type { ProductSearchRequest as ProductSearchQueryBody } from "@commercetools/platform-sdk";
