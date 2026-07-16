export type * from "./types/index.js";
export {
  DEFAULT_COMMERCE_AI_SEARCH_MESSAGES,
  resolveCommerceAISearchMessages,
} from "./messages/index.js";
export type { CommerceAISearchMessages } from "./messages/index.js";
export { createAIProvider } from "./ai/factory.js";
export type { AIProvider } from "./ai/types.js";
export { createCommercetoolsClient } from "./commercetools/client.js";
export type { CommercetoolsClient, ProductSearchBuildInput, ProductSearchQueryOptions } from "./commercetools/client.js";
export {
  FacetSchemaStore,
  resolveFacetSchema,
} from "./commercetools/product-types.js";
export {
  buildProductSearchFacets,
  buildProjectionFacetParams,
  filterFacetSuggestions,
  isFacetFilterSelected,
  normalizeProductSearchFacets,
  priceBucketKeyFromFilters,
  priceRangeToFilterValues,
  toggleFacetFilter,
  CATEGORIES_FACET_ID,
  DEFAULT_PRICE_RANGES,
  PRICE_FACET_ID,
} from "./commercetools/facets.js";
export {
  buildProductSearchBody,
  buildProductSearchRequest,
  buildProjectionSearchQueryArgs,
  hasSearchableContent,
  joinSearchTerms,
} from "./commercetools/query-builder.js";
export { createSearchOrchestrator } from "./search/orchestrator.js";
export type { SearchOrchestrator, SearchOrchestratorDeps } from "./search/orchestrator.js";
export {
  parseInterpretedQuery,
  parseVoiceAudioInterpretation,
  buildRefineQueryUserMessage,
  buildSchemaAwareTextQueryUserMessage,
} from "./prompts/index.js";
export {
  buildTtsSummaryFallback,
  buildTtsSummaryUserMessage,
  TTS_SUMMARY_PROMPT,
} from "./search/voice-tts.js";
export { resolveSearchLocales } from "./locale/resolve.js";
export {
  clampSuggestionsLimit,
  normalizeSuggestionsPrefix,
  resolveSuggestLocale,
  SUGGESTIONS_MAX_PREFIX_LENGTH,
} from "./search/suggestions-input.js";
export { logSearchTrace } from "./utils/dev-trace.js";
export { SearchTimeoutError } from "./utils/with-timeout.js";
