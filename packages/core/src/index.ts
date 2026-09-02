export type * from "./types/index.js";
export { CART_SESSION_HEADER, MAX_LINE_ITEM_QUANTITY } from "./types/index.js";
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
  createCartOperations,
  mapCartToSnapshot,
  CartAccessDeniedError,
  CartNotFoundError,
  InvalidCredentialsError,
  MissingPriceError,
} from "./commercetools/cart.js";
export {
  CheckoutIncompleteError,
  createCheckoutOperations,
  createCheckoutOrderNumber,
} from "./commercetools/checkout.js";
export { mapOrderToSnapshot } from "./commercetools/order.js";
export type {
  CheckoutGateway,
  CheckoutOperations,
  CheckoutOperationsOptions,
} from "./commercetools/checkout.js";
export {
  OrderNotFoundError,
  createOrderOperations,
  buildAnonymousOrderWhere,
  buildCustomerOrderWhere,
  buildOwnerOrderWhere,
  buildOwnerOrdersWhere,
} from "./commercetools/order.js";
export type { OrderGateway, OrderOperations } from "./commercetools/order.js";
export {
  PaymentDeclinedError,
  PaymentNotConfiguredError,
  createPaymentOperations,
  createPaymentKey,
} from "./commercetools/payment.js";
export type { PaymentGateway, PaymentOperations } from "./commercetools/payment.js";
export type {
  PaymentProvider,
  PaymentAuthorizationRequest,
  PaymentAuthorizationResult,
  PaymentMethodOption,
} from "./payments/types.js";
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
  formatFacetBucketLabel,
  hexColorSwatchValue,
  isColorLikeFacetName,
  isHexColorFacetKey,
} from "./commercetools/facet-color.js";
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
export {
  isSuggestiblePhrase,
  SUGGESTION_MAX_LENGTH,
  SUGGESTION_MAX_WORDS,
} from "./commercetools/suggestion-quality.js";
export { createSearchOrchestrator } from "./search/orchestrator.js";
export type { SearchOrchestrator, SearchOrchestratorDeps } from "./search/orchestrator.js";
export {
  parseInterpretedQuery,
  parseVoiceAudioInterpretation,
  parseSuggestSearchTerms,
  parseDecomposedMission,
  MAX_MISSION_INTENTS,
  buildRefineQueryUserMessage,
  buildSchemaAwareTextQueryUserMessage,
  buildSuggestSearchTermsUserMessage,
  TTS_SUMMARY_PROMPT,
  MAX_INTERPRETED_SEARCH_TERMS,
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
  suggestionPrefixes,
  suggestionMatchesQueryTokens,
  filterSuggestionsByQueryTokens,
  AI_SUGGESTION_FALLBACK_MIN_LENGTH,
  SUGGESTIONS_MAX_PREFIX_LENGTH,
} from "./search/suggestions-input.js";
export {
  isLikelyProductQuery,
  localesShareLanguage,
  mergeInterpretedSearchTerms,
} from "./search/query-passthrough.js";
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
