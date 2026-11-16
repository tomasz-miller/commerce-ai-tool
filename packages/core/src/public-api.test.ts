import { describe, expect, it } from "vitest";
import type {
  AICallMetrics,
  AICallOptions,
  AIProvider,
  AITask,
  CommerceAISearchMessages,
  CommercetoolsClient,
  PaymentAuthorizationRequest,
  PaymentAuthorizationResult,
  PaymentMethodOption,
  PaymentProvider,
  ProductSearchBuildInput,
  ProductSearchQueryBody,
  ProductSearchQueryOptions,
  ResolvedCommerceAISearchMessages,
  SUGGESTIONS_DEFAULT_LIMIT,
  SUGGESTIONS_MAX_LIMIT,
  SUGGESTIONS_MIN_PREFIX_LENGTH,
  SearchOrchestrator,
  SearchOrchestratorDeps,
} from "./index.js";
import type {
  AIProviderTraceMeta,
  BuildSearchKeywordsFromProductCopyInput,
  BuildSearchKeywordsFromProductCopyResult,
  BuiltSearchKeywords,
  CheckoutGateway,
  CheckoutOperations,
  CheckoutOperationsOptions,
  LocalizedTextMap,
  OrderGateway,
  OrderOperations,
  PaymentGateway,
  PaymentOperations,
  PipelineSpanAttributes,
  PropagatedTraceMetadata,
  RedactedBinaryInput,
  ResolvedSystemPrompt,
  ResolvedSystemPromptSource,
  ShippingScopeOptions,
  SystemPromptName,
  WhitespaceSearchKeyword,
} from "./internal.js";

/** Type-level list of the types moved to core/internal: `pnpm typecheck` fails when one stops resolving. */
export type _InternalTypeExports = [
  AIProviderTraceMeta,
  BuildSearchKeywordsFromProductCopyInput,
  BuildSearchKeywordsFromProductCopyResult,
  BuiltSearchKeywords,
  CheckoutGateway,
  CheckoutOperations,
  CheckoutOperationsOptions,
  LocalizedTextMap,
  OrderGateway,
  OrderOperations,
  PaymentGateway,
  PaymentOperations,
  PipelineSpanAttributes,
  PropagatedTraceMetadata,
  RedactedBinaryInput,
  ResolvedSystemPrompt,
  ResolvedSystemPromptSource,
  ShippingScopeOptions,
  SystemPromptName,
  WhitespaceSearchKeyword,
];

/** Type-level list of the public named types: `pnpm typecheck` fails when one stops resolving. */
export type _PublicTypeExports = [
  AICallMetrics,
  AICallOptions,
  AIProvider,
  AITask,
  CommerceAISearchMessages,
  CommercetoolsClient,
  PaymentAuthorizationRequest,
  PaymentAuthorizationResult,
  PaymentMethodOption,
  PaymentProvider,
  ProductSearchBuildInput,
  ProductSearchQueryBody,
  ProductSearchQueryOptions,
  ResolvedCommerceAISearchMessages,
  typeof SUGGESTIONS_DEFAULT_LIMIT,
  typeof SUGGESTIONS_MAX_LIMIT,
  typeof SUGGESTIONS_MIN_PREFIX_LENGTH,
  SearchOrchestrator,
  SearchOrchestratorDeps,
];

/**
 * The semver-covered runtime surface of `@commerce-ai-tool/core`. Adding a name here is a public
 * API decision; implementation helpers belong in `./internal.ts` (`@commerce-ai-tool/core/internal`,
 * no semver guarantee). Types declared in `types/` are public through `export type *` and are
 * not listed here.
 */
const PUBLIC_RUNTIME_EXPORTS = [
  "AIOutputTruncatedError",
  "AIRateLimitedError",
  "AIUpstreamError",
  "ANONYMOUS_ID_HEADER",
  "CART_SESSION_HEADER",
  "CartAccessDeniedError",
  "CartNotFoundError",
  "CheckoutIncompleteError",
  "CountryNotAllowedError",
  "CurrencyMismatchError",
  "DEFAULT_BEDROCK_MODEL",
  "DEFAULT_COMMERCE_AI_SEARCH_MESSAGES",
  "DEFAULT_OPENROUTER_MODEL",
  "DEFAULT_OPENROUTER_VISION_MODEL",
  "DEFAULT_OPENROUTER_VOICE_MODEL",
  "InvalidCredentialsError",
  "MAX_LINE_ITEM_QUANTITY",
  "MAX_TOKENS",
  "MissingPriceError",
  "ORDER_NUMBER_PATTERN",
  "OrderNotFoundError",
  "PaymentDeclinedError",
  "PaymentNotConfiguredError",
  "ProductSearchUnavailableError",
  "SearchTimeoutError",
  "UnsupportedAudioTypeError",
  "VoiceNotConfiguredError",
  "createAIProvider",
  "createCommercetoolsClient",
  "createSearchOrchestrator",
  "formatNamedMessage",
  "isFacetFilterSelected",
  "normalizeProductSearchFacets",
  "priceBucketKeyFromFilters",
  "priceRangeToFilterValues",
  "resolveCommerceAISearchMessages",
  "toggleFacetFilter",
];

/** Runtime exports that moved to `@commerce-ai-tool/core/internal` in 3.0.0. */
const INTERNAL_RUNTIME_EXPORTS = [
  "AI_SUGGESTION_FALLBACK_MIN_LENGTH",
  "CATEGORIES_FACET_ID",
  "DEFAULT_PRICE_RANGES",
  "FacetSchemaStore",
  "MAX_INTERPRETED_SEARCH_TERMS",
  "MAX_MISSION_INTENTS",
  "MAX_QUERY_CHARS",
  "MAX_TTS_CHARS",
  "PRICE_FACET_ID",
  "PRIMARY_TERM_BOOST_MULTIPLIER",
  "REFINE_QUERY_SYSTEM_PROMPT",
  "SUGGESTIONS_MAX_PREFIX_LENGTH",
  "SUGGESTION_MAX_LENGTH",
  "SUGGESTION_MAX_WORDS",
  "SUPPORTED_AUDIO_MIME_TYPES",
  "SYSTEM_PROMPT_CATALOG",
  "SYSTEM_PROMPT_NAMES",
  "TTS_SUMMARY_PROMPT",
  "buildAnonymousOrderWhere",
  "buildCustomerOrderWhere",
  "buildCustomerSignin",
  "buildOwnerOrderWhere",
  "buildOwnerOrdersWhere",
  "buildProductSearchFacets",
  "buildProductSearchRequest",
  "buildProjectionFacetParams",
  "buildProjectionSearchQueryArgs",
  "buildRefineQueryUserMessage",
  "buildSchemaAwareTextQueryUserMessage",
  "buildSearchKeywordsFromProductCopy",
  "buildSuggestSearchTermsUserMessage",
  "buildTtsSummaryFallback",
  "buildTtsSummaryUserMessage",
  "clampSuggestionsLimit",
  "configureLangfusePrompts",
  "createCartOperations",
  "createCheckoutOperations",
  "createCheckoutOrderNumber",
  "createOrderOperations",
  "createPaymentKey",
  "createPaymentOperations",
  "createRandomUuid",
  "dropSoftFilters",
  "filterFacetSuggestions",
  "filterSuggestionsByQueryTokens",
  "formatFacetBucketLabel",
  "getCurrentTraceId",
  "getLocalSystemPrompt",
  "hasNonEmptySearchKeywords",
  "hasSearchableContent",
  "hasSoftFilters",
  "hexColorSwatchValue",
  "isColorLikeFacetName",
  "isHexColorFacetKey",
  "isLangfuseEnabled",
  "isLangfusePromptsEnabled",
  "isLikelyProductQuery",
  "isSuggestiblePhrase",
  "isUsableMission",
  "joinSearchTerms",
  "linkActiveGenerationPrompt",
  "listSystemPromptEntries",
  "localesShareLanguage",
  "logSearchTrace",
  "looksLikeCompoundShoppingList",
  "looksLikeShoppingList",
  "mapCartToSnapshot",
  "mapOrderToSnapshot",
  "mergeInterpretedSearchTerms",
  "normalizeSuggestionList",
  "normalizeSuggestionsPrefix",
  "parseDecomposedMission",
  "parseInterpretedQuery",
  "parseSuggestSearchTerms",
  "parseVoiceAudioInterpretation",
  "parseVoiceTranscriptInterpretation",
  "redactBase64ImageInput",
  "redactBinaryInput",
  "relaxInterpretedSearch",
  "resolveAndLinkSystemPrompt",
  "resolveFacetSchema",
  "resolveMissionOptions",
  "resolveSearchLocales",
  "resolveSuggestLocale",
  "resolveSuggestLocales",
  "resolveSystemPrompt",
  "resolveVoiceMode",
  "shouldExposeTraceId",
  "shouldTraceSuggestions",
  "shouldUseAiSuggestionFallback",
  "suggestionMatchesQueryTokens",
  "suggestionPrefixes",
  "truncateTtsText",
  "withPipelineSpan",
  "withPropagatedAttributes",
  "withTraceIdMeta",
  "withTraceSession",
  "wrapAIProvider",
];

/** Importing the entries loads the AI and commercetools SDKs, slow under a parallel test run. */
const IMPORT_TIMEOUT_MS = 30_000;

describe("core public API", () => {
  it("the main entry exports exactly the documented public API", async () => {
    const index = await import("./index.js");

    expect(Object.keys(index).sort()).toEqual([...PUBLIC_RUNTIME_EXPORTS].sort());
  }, IMPORT_TIMEOUT_MS);

  it("keeps internal type names off the main entry", () => {
    // Compile-time checks (run by `pnpm typecheck`): every internal type must fail to resolve.
    // @ts-expect-error moved to core/internal
    type _CheckoutGateway = import("./index.js").CheckoutGateway;
    // @ts-expect-error moved to core/internal
    type _CheckoutOperations = import("./index.js").CheckoutOperations;
    // @ts-expect-error moved to core/internal
    type _CheckoutOperationsOptions = import("./index.js").CheckoutOperationsOptions;
    // @ts-expect-error moved to core/internal
    type _OrderGateway = import("./index.js").OrderGateway;
    // @ts-expect-error moved to core/internal
    type _OrderOperations = import("./index.js").OrderOperations;
    // @ts-expect-error moved to core/internal
    type _PaymentGateway = import("./index.js").PaymentGateway;
    // @ts-expect-error moved to core/internal
    type _PaymentOperations = import("./index.js").PaymentOperations;
    // @ts-expect-error moved to core/internal
    type _ShippingScopeOptions = import("./index.js").ShippingScopeOptions;
    // @ts-expect-error moved to core/internal
    type _ResolvedSystemPrompt = import("./index.js").ResolvedSystemPrompt;
    // @ts-expect-error moved to core/internal
    type _ResolvedSystemPromptSource = import("./index.js").ResolvedSystemPromptSource;
    // @ts-expect-error moved to core/internal
    type _SystemPromptName = import("./index.js").SystemPromptName;
    // @ts-expect-error moved to core/internal
    type _BuiltSearchKeywords = import("./index.js").BuiltSearchKeywords;
    // @ts-expect-error moved to core/internal
    type _BuildSearchKeywordsFromProductCopyInput = import("./index.js").BuildSearchKeywordsFromProductCopyInput;
    // @ts-expect-error moved to core/internal
    type _BuildSearchKeywordsFromProductCopyResult = import("./index.js").BuildSearchKeywordsFromProductCopyResult;
    // @ts-expect-error moved to core/internal
    type _LocalizedTextMap = import("./index.js").LocalizedTextMap;
    // @ts-expect-error moved to core/internal
    type _WhitespaceSearchKeyword = import("./index.js").WhitespaceSearchKeyword;
    // @ts-expect-error moved to core/internal
    type _AIProviderTraceMeta = import("./index.js").AIProviderTraceMeta;
    // @ts-expect-error moved to core/internal
    type _PipelineSpanAttributes = import("./index.js").PipelineSpanAttributes;
    // @ts-expect-error moved to core/internal
    type _PropagatedTraceMetadata = import("./index.js").PropagatedTraceMetadata;
    // @ts-expect-error moved to core/internal
    type _RedactedBinaryInput = import("./index.js").RedactedBinaryInput;
    expect(true).toBe(true);
  });

  it("internal helpers are reachable from core/internal", async () => {
    const index = await import("./index.js");
    const internal = await import("./internal.js");

    expect(Object.keys(internal).sort()).toEqual([...INTERNAL_RUNTIME_EXPORTS].sort());
    // The two entries are disjoint: a name lives in exactly one of them.
    for (const name of Object.keys(internal)) {
      expect(name in index, name).toBe(false);
    }
    expect(typeof internal.buildProductSearchRequest).toBe("function");
    expect(typeof internal.createCartOperations).toBe("function");
  }, IMPORT_TIMEOUT_MS);
});
