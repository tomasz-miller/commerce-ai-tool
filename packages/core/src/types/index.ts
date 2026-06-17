export type ThemeMode = "auto" | "light" | "dark";

export type AIProviderName = "openrouter" | "bedrock";

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
}

export interface SearchResult {
  products: ProductCard[];
  meta: SearchMeta;
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

export interface InterpretedSearchQuery {
  searchTerms: string[];
  filters?: Record<string, string>;
  sort?: "relevance" | "price_asc" | "price_desc";
  interpretation: string;
}

export interface ProductSearchQueryBody {
  query?: {
    fullText?: {
      field: string;
      language: string;
      value: string;
    };
    or?: Array<{
      fullText?: {
        field: string;
        language: string;
        value: string;
      };
    }>;
  };
  limit?: number;
  offset?: number;
  sort?: Array<{
    field: string;
    order: "asc" | "desc";
  }>;
}
