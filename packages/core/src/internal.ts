/**
 * Implementation helpers of `@commerce-ai-tool/core`, published as `@commerce-ai-tool/core/internal`.
 *
 * NO SEMVER GUARANTEE: names, signatures and behaviour here can change or disappear in any release,
 * including patch releases. They exist so the sibling packages (`@commerce-ai-tool/server`, the evals
 * and repository scripts) can share code; host applications should use `@commerce-ai-tool/core` and
 * `@commerce-ai-tool/core/client`. Re-exports only: the code stays in its own module.
 */
export {
  createRandomUuid,
} from "./utils/random-uuid.js";
export {
  buildCustomerSignin,
  createCartOperations,
  mapCartToSnapshot,
} from "./commercetools/cart.js";
export {
  createCheckoutOperations,
  createCheckoutOrderNumber,
} from "./commercetools/checkout.js";
export {
  mapOrderToSnapshot,
} from "./commercetools/order.js";
export type {
  CheckoutGateway,
  CheckoutOperations,
  CheckoutOperationsOptions,
  ShippingScopeOptions,
} from "./commercetools/checkout.js";
export {
  createOrderOperations,
  buildAnonymousOrderWhere,
  buildCustomerOrderWhere,
  buildOwnerOrderWhere,
  buildOwnerOrdersWhere,
} from "./commercetools/order.js";
export type {
  OrderGateway,
  OrderOperations,
} from "./commercetools/order.js";
export {
  createPaymentOperations,
  createPaymentKey,
} from "./commercetools/payment.js";
export type {
  PaymentGateway,
  PaymentOperations,
} from "./commercetools/payment.js";
export {
  FacetSchemaStore,
  resolveFacetSchema,
} from "./commercetools/product-types.js";
export {
  buildProductSearchFacets,
  buildProjectionFacetParams,
  filterFacetSuggestions,
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
  buildProductSearchRequest,
  buildProjectionSearchQueryArgs,
  hasSearchableContent,
  joinSearchTerms,
  PRIMARY_TERM_BOOST_MULTIPLIER,
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
export {
  looksLikeCompoundShoppingList,
  looksLikeShoppingList,
  isUsableMission,
  resolveMissionOptions,
} from "./search/mission.js";
export {
  resolveVoiceMode,
} from "./search/context.js";
export {
  parseInterpretedQuery,
  parseVoiceAudioInterpretation,
  parseVoiceTranscriptInterpretation,
  parseSuggestSearchTerms,
  parseDecomposedMission,
  MAX_MISSION_INTENTS,
  MAX_QUERY_CHARS,
  buildRefineQueryUserMessage,
  buildSchemaAwareTextQueryUserMessage,
  buildSuggestSearchTermsUserMessage,
  TTS_SUMMARY_PROMPT,
  REFINE_QUERY_SYSTEM_PROMPT,
  MAX_INTERPRETED_SEARCH_TERMS,
} from "./prompts/index.js";
export {
  SYSTEM_PROMPT_NAMES,
  SYSTEM_PROMPT_CATALOG,
  getLocalSystemPrompt,
  listSystemPromptEntries,
} from "./prompts/catalog.js";
export type {
  SystemPromptName,
} from "./prompts/catalog.js";
export {
  resolveSystemPrompt,
  resolveAndLinkSystemPrompt,
  linkActiveGenerationPrompt,
  configureLangfusePrompts,
} from "./prompts/resolve.js";
export type {
  ResolvedSystemPrompt,
  ResolvedSystemPromptSource,
} from "./prompts/resolve.js";
export {
  buildTtsSummaryFallback,
  buildTtsSummaryUserMessage,
  MAX_TTS_CHARS,
  truncateTtsText,
} from "./search/voice-tts.js";
export {
  resolveSearchLocales,
} from "./locale/resolve.js";
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
export {
  relaxInterpretedSearch,
  dropSoftFilters,
  hasSoftFilters,
} from "./search/relax-search.js";
export {
  logSearchTrace,
} from "./utils/dev-trace.js";
export {
  SUPPORTED_AUDIO_MIME_TYPES,
} from "./utils/audio.js";
export {
  isLangfuseEnabled,
  isLangfusePromptsEnabled,
  shouldExposeTraceId,
  shouldTraceSuggestions,
  getCurrentTraceId,
  withPipelineSpan,
  withPropagatedAttributes,
  withTraceSession,
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
