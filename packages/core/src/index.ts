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
export {
  buildSearchKeywordsFromProductCopy,
  hasNonEmptySearchKeywords,
} from "./commercetools/build-search-keywords.js";
export type {
  BuildSearchKeywordsFromProductCopyInput,
  BuildSearchKeywordsFromProductCopyResult,
  BuiltSearchKeywords,
  LocalizedTextMap,
  WhitespaceSearchKeyword,
} from "./commercetools/build-search-keywords.js";
export { createSearchOrchestrator } from "./search/orchestrator.js";
export type { SearchOrchestrator, SearchOrchestratorDeps } from "./search/orchestrator.js";
export {
  parseInterpretedQuery,
  parseVoiceAudioInterpretation,
  parseSuggestSearchTerms,
  buildRefineQueryUserMessage,
  buildSchemaAwareTextQueryUserMessage,
  buildSuggestSearchTermsUserMessage,
  TTS_SUMMARY_PROMPT,
} from "./prompts/index.js";
export {
  SYSTEM_PROMPT_NAMES,
  SYSTEM_PROMPT_CATALOG,
  getLocalSystemPrompt,
  listSystemPromptEntries,
} from "./prompts/catalog.js";
export type { SystemPromptName } from "./prompts/catalog.js";
export {
  resolveSystemPrompt,
  resolveAndLinkSystemPrompt,
  linkActiveGenerationPrompt,
  configureLangfusePrompts,
} from "./prompts/resolve.js";
export type { ResolvedSystemPrompt, ResolvedSystemPromptSource } from "./prompts/resolve.js";
export {
  buildTtsSummaryFallback,
  buildTtsSummaryUserMessage,
} from "./search/voice-tts.js";
export { resolveSearchLocales } from "./locale/resolve.js";
export {
  clampSuggestionsLimit,
  normalizeSuggestionList,
  normalizeSuggestionsPrefix,
  resolveSuggestLocale,
  resolveSuggestLocales,
  shouldUseAiSuggestionFallback,
  AI_SUGGESTION_FALLBACK_MIN_LENGTH,
  SUGGESTIONS_MAX_PREFIX_LENGTH,
} from "./search/suggestions-input.js";
export { logSearchTrace } from "./utils/dev-trace.js";
export { SearchTimeoutError } from "./utils/with-timeout.js";
export {
  isLangfuseEnabled,
  isLangfusePromptsEnabled,
  shouldExposeTraceId,
  shouldTraceSuggestions,
  getCurrentTraceId,
  withPipelineSpan,
  withPropagatedAttributes,
  withTraceIdMeta,
  wrapAIProvider,
  redactBinaryInput,
  redactBase64ImageInput,
} from "./observability/index.js";
export type {
  AIProviderTraceMeta,
  PipelineSpanAttributes,
  PropagatedTraceMetadata,
  RedactedBinaryInput,
} from "./observability/index.js";
