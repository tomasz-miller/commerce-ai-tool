/**
 * Public, semver-covered entry of `@commerce-ai-tool/core`: the config and wire types, the
 * extension contracts (`AIProvider`, `PaymentProvider`, `CommercetoolsClient`, `SearchOrchestrator`),
 * the factories hosts call, the error classes hosts may catch and the documented constants.
 * Implementation helpers (builders, parsers, prompt utilities, commercetools internals, tracing
 * helpers) live in `./internal.ts`, published as `@commerce-ai-tool/core/internal` without a semver
 * guarantee. Browser-safe pieces are in `./client.ts`.
 */
export type * from "./types/index.js";
/**
 * @deprecated Use ProductSearchRequest from query-builder / platform-sdk.
 * Kept on the server entry only: the browser-safe `client` entry is vendored
 * into the React and Angular packages, which do not depend on platform-sdk.
 */
export type { ProductSearchRequest as ProductSearchQueryBody } from "@commercetools/platform-sdk";
export {
  ANONYMOUS_ID_HEADER,
  CART_SESSION_HEADER,
  MAX_LINE_ITEM_QUANTITY,
  ORDER_NUMBER_PATTERN,
} from "./config/defaults.js";
/**
 * Type-only, as before the constants moved out of `types/` (`export type *` never carried the
 * runtime value); kept so `typeof SUGGESTIONS_MAX_LIMIT` still resolves for hosts.
 */
export type {
  SUGGESTIONS_DEFAULT_LIMIT,
  SUGGESTIONS_MAX_LIMIT,
  SUGGESTIONS_MIN_PREFIX_LENGTH,
} from "./config/defaults.js";
export {
  DEFAULT_COMMERCE_AI_SEARCH_MESSAGES,
  formatNamedMessage,
  resolveCommerceAISearchMessages,
} from "./messages/index.js";
export type {
  CommerceAISearchMessages,
  ResolvedCommerceAISearchMessages,
} from "./messages/index.js";
export { createAIProvider } from "./ai/factory.js";
export type { AIProvider, AICallMetrics, AICallOptions } from "./ai/types.js";
export { AIOutputTruncatedError, AIRateLimitedError, AIUpstreamError } from "./ai/errors.js";
export {
  DEFAULT_OPENROUTER_MODEL,
  DEFAULT_OPENROUTER_VISION_MODEL,
  DEFAULT_OPENROUTER_VOICE_MODEL,
  DEFAULT_BEDROCK_MODEL,
  MAX_TOKENS,
} from "./ai/defaults.js";
export type { AITask } from "./ai/defaults.js";
export { createCommercetoolsClient } from "./commercetools/client.js";
export type { CommercetoolsClient, ProductSearchBuildInput, ProductSearchQueryOptions } from "./commercetools/client.js";
export {
  CartAccessDeniedError,
  CartNotFoundError,
  InvalidCredentialsError,
  MissingPriceError,
} from "./commercetools/cart.js";
export {
  CheckoutIncompleteError,
  CountryNotAllowedError,
  CurrencyMismatchError,
} from "./commercetools/checkout.js";
export { OrderNotFoundError } from "./commercetools/order.js";
export { ProductSearchUnavailableError } from "./commercetools/search-helpers.js";
export { PaymentDeclinedError, PaymentNotConfiguredError } from "./commercetools/payment.js";
export type {
  PaymentProvider,
  PaymentAuthorizationRequest,
  PaymentAuthorizationResult,
  PaymentMethodOption,
} from "./payments/types.js";
export {
  isFacetFilterSelected,
  normalizeProductSearchFacets,
  priceBucketKeyFromFilters,
  priceRangeToFilterValues,
  toggleFacetFilter,
} from "./commercetools/facets.js";
export { createSearchOrchestrator, VoiceNotConfiguredError } from "./search/orchestrator.js";
export type { SearchOrchestrator, SearchOrchestratorDeps } from "./search/orchestrator.js";
// Type only: `SearchOrchestratorDeps.facetSchemaStore` is typed with it. The runtime class stays in /internal.
export type { FacetSchemaStore } from "./commercetools/product-types.js";
export { SearchTimeoutError } from "./utils/with-timeout.js";
export { UnsupportedAudioTypeError } from "./utils/audio.js";
