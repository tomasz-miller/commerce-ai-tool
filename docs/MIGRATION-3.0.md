# Migrating to 3.0.0

`@commerce-ai-tool/core`, `server`, `react` and `angular` are released together (one version). 3.0.0 turns the security defaults introduced as warnings in 2.x into requirements and removes 2.x APIs. [Documentation index](README.md).

Besides the numbered items, 3.0.0 changes how the widgets look and what their DOM is ([item 15](#15-visual-and-dom-changes-in-the-react-and-angular-widgets)) and carries smaller behaviour changes that can need action in a host ([item 16](#16-behaviour-changes-that-may-need-action)); the CHANGELOG has the full detail. Not changed: the Angular and React 2.x compatibility accessors, the optional message keys, the CommonJS builds and the `require` export condition of `core`, `server` and `react` (the Angular package is ESM only, see [item 14](#14-angular-package-format-esm-only-new-peer-range)), the Bedrock default model and the `locale` aliases.

Upgrade the four packages to the same 3.0.0 version, then walk this checklist. Items marked **Action** need a change in your host.

| # | Change | Who is affected |
|---|--------|-----------------|
| 1 | [A strong session secret is required](#1-a-strong-session-secret-is-required) | Every host outside development and test |
| 2 | [Session tokens need `iat`](#2-session-tokens-need-iat) | Hosts with signed-in shoppers |
| 3 | [Guest id is read from the header only](#3-guest-id-is-read-from-the-header-only) | Custom clients and proxies |
| 4 | [Product Projection Search fallback is off](#4-product-projection-search-fallback-is-off-by-default) | Projects without Product Search |
| 5 | [React 19 is required](#5-react-19-is-required) | React hosts |
| 6 | [`cartVersion` removed](#6-cartversion-removed) | Code that types or sends mutation bodies |
| 7 | [`CheckoutGateway.updateOrder` removed](#7-checkoutgatewayupdateorder-removed) | Code that types against `CheckoutGateway` (now internal, see item 13) |
| 8 | [`getLastGenerationMetrics` and `GenerationMetrics` removed](#8-getlastgenerationmetrics-and-generationmetrics-removed) | Custom `AIProvider` |
| 9 | [`audioSummary` removed from the voice hook and the Angular component](#9-audiosummary-removed-from-the-voice-hook-and-the-angular-component) | Custom voice UIs |
| 10 | [Error responses carry a `code`](#10-error-responses-carry-a-code) | Code that reads error bodies or switches over error codes |
| 11 | [`SearchOrchestrator.getFacetSchema` is required](#11-searchorchestratorgetfacetschema-is-required) | Hosts that implement or mock the orchestrator |
| 12 | [Removed internal exports](#12-removed-internal-exports) | Imports of the names listed there |
| 13 | [Internal helpers moved to `@commerce-ai-tool/core/internal`](#13-internal-helpers-moved-to-commerce-ai-toolcoreinternal) | Hosts that import helpers (not types, errors or factories) from `@commerce-ai-tool/core` |
| 14 | [Angular package format: ESM only, new peer range](#14-angular-package-format-esm-only-new-peer-range) | Angular hosts |
| 15 | [Visual and DOM changes in the React and Angular widgets](#15-visual-and-dom-changes-in-the-react-and-angular-widgets) | Hosts with custom CSS, tests or selectors that target the widgets |
| 16 | [Behaviour changes that may need action](#16-behaviour-changes-that-may-need-action) | Every host, skim the list |

## 1. A strong session secret is required

**Before (2.x).** `CAT_CART_SESSION_SECRET` (`config.cartSession.secret`) was optional. Without it the customer session tokens were signed with the commercetools client secret, and production only logged a warning.

**After (3.0.0).**

- `createCommerceAIServer` throws at startup when a configured secret is shorter than **32 bytes**, in every environment (`development` and `test` included). It also throws when no secret is set, unless `NODE_ENV` is exactly `development` or `test`. An unset `NODE_ENV` (common for Express hosts), `staging` and `production` all require the secret. This covers `createNextHandlers`, `createNextRouteHandler` (on its first request, because its config may be a function) and `createExpressRouter`. Only `createCommerceAIServer` validates the secret; code that builds handlers some other way must check its own.
- The length is the UTF-8 byte length of the trimmed value: 32 ASCII characters, or 16 two-byte characters such as `é`. The error message states the length it found and never repeats the secret.
- The commercetools client secret is never used as a signing key.
- Only in `development` and `test` is an unset secret replaced by a random one that lives as long as the process (kept on `globalThis`, because a dev server re-evaluates the module on a hot reload and would otherwise invalidate issued tokens). One warning is logged. Customer sessions then end whenever the server restarts.
- The `cartSessionSecret` field of the object returned by `createCommerceAIServer` is non-enumerable, so logging or serialising the object does not print the secret.

**Action.**

1. Generate a secret: `openssl rand -base64 48`.
2. Set it as `CAT_CART_SESSION_SECRET` in every deployed environment, staging included, and wherever the process runs with `NODE_ENV` unset or set to something other than `development`/`test` (or `cartSession: { secret }` when you build the config in code). Store it like any other server secret. Local dev scripts must run with `NODE_ENV=development` to use the random secret; the demo-angular `dev:bff` script does.
3. Roll it out knowing that **all signed-in shoppers are signed out once** when you switch from the client-secret fallback to the new secret (their old tokens no longer verify). The widgets handle the resulting 401 `SESSION_INVALID` by returning to a guest session.
4. Treat the secret as a permanent value: rotating it signs everyone out.

Build steps are not affected: nothing creates the server while `next build` collects pages when you use the lazy catch-all handler of the Getting Started guide. If you call `createNextHandlers(...)` at module top level, `next build` runs with `NODE_ENV=production` and needs the variable too.

## 2. Session tokens need `iat`

**Before (2.x).** Session tokens had a 7-day lifetime and carried the customer `email` but no `iat`. There was no revocation hook (`isRevoked` and `onLogout` are new in 3.0.0).

**After.** New tokens carry `{ customerId, iat, exp }` and live 24 hours. A token is rejected with 401 `SESSION_INVALID` unless it carries a finite `iat` that is not negative and not more than 60 seconds in the future (clock skew between instances). Every token issued by 2.x lacks `iat`, so every existing session ends at the upgrade. `isRevoked` always receives a real `iat`.

**Action.** None for the library: shoppers signed in at the time of the upgrade sign in again, which the widgets do after the 401 (the same one-time sign-out as in item 1). If you add an `isRevoked` hook, it never sees `iat === 0`.

Behaviour that is documented rather than changed: an error thrown by `isRevoked` or `onLogout` fails the request with 500 `INTERNAL` (the hook's message is not sent to the browser), and `POST /cart/logout` answers 200 for a missing, invalid, expired or revoked token. The widgets drop the local session even when logout fails.

## 3. Guest id is read from the header only

**Before.** `GET /cart`, `/cart/shipping-methods`, `/cart/payment-methods` and `/orders` accepted the guest id in the `anonymousId` query parameter when the `x-commerce-ai-anonymous-id` header was absent.

**After.** Only the header is read. A GET with only the query parameter is rejected with 400 `VALIDATION` (no guest id). Mutations still carry `anonymousId` in the JSON body.

**Action.** The React and Angular widgets, `createCommerceAIApiClient` and both demos already send the header. Custom clients: send `x-commerce-ai-anonymous-id: <id>` (exported as `ANONYMOUS_ID_HEADER`) instead of `?anonymousId=`, and make sure a cross-origin setup allows the header in CORS (`createExpressRouter({ corsOrigins })` does by default).

## 4. Product Projection Search fallback is off by default

**Before (2.x).** When Product Search was not enabled on the project, the client always fell back to the deprecated Product Projection Search; there was no switch.

**After.** The fallback is opt-in through `CAT_LEGACY_PRODUCT_PROJECTION_SEARCH=true` (`commercetools.legacyProductProjectionSearch: true`) and off by default. Without it the search throws `ProductSearchUnavailableError` (exported from `@commerce-ai-tool/core`). The server answers 503 `UPSTREAM_UNAVAILABLE` with the fixed message "Product search is not available" and logs a warning that names the project and the Merchant Center setting ("Product Search API is not enabled for project ..."). The fallback logs a deprecation warning once per process and cannot be used on projects created after 31 August 2026.

**Action.** Enable Product Search on the project (Merchant Center, Settings, Project settings, Storefront Search). Only if you cannot yet, set the flag to `true` explicitly.

## 5. React 19 is required

**Before.** `@commerce-ai-tool/react` declared `react` and `react-dom` `>=18` but was only tested on React 19.

**After.** The peer range is `>=19`. `CommerceAICheckout` runs its steps in an async `startTransition`, which only keeps `isPending` true across the awaits in React 19.

**Action.** Upgrade `react` and `react-dom` to 19, or stay on `@commerce-ai-tool/react` 2.x. The Angular package has its own, changed peer range ([item 14](#14-angular-package-format-esm-only-new-peer-range)).

## 6. `cartVersion` removed

**Before.** `CartMutationRequest.cartVersion?: number` was accepted and ignored by the server (it applies each change to the current cart version and retries once on a conflict). The widgets still sent it.

**After.** The field is gone from `CartMutationRequest` and `UpdateCartQuantityRequest`, from the server's parsing and from the widgets. A body that still contains `cartVersion` is accepted and the field is ignored, so old clients keep working.

**Action.** Remove `cartVersion` from any code that builds these request objects. TypeScript reports an excess property on object literals.

## 7. `CheckoutGateway.updateOrder` removed

**Before.** `updateOrder` was a required member that core called after creating the order, to set the payment state.

**After.** The member is removed from the `CheckoutGateway` interface. The interface itself is no longer part of the public API: it moved to `@commerce-ai-tool/core/internal` ([item 13](#13-internal-helpers-moved-to-commerce-ai-toolcoreinternal)), because hosts have no way to inject a gateway.

**Action.** Delete `updateOrder` from any code that implements the interface (importing it from `@commerce-ai-tool/core/internal`). `createOrderFromCart` now takes an optional `paymentState` argument and must forward it into the `OrderFromCartDraft`.

## 8. `getLastGenerationMetrics` and `GenerationMetrics` removed

**Before.** `AIProvider.getLastGenerationMetrics?()` and the `GenerationMetrics` type existed. The Langfuse wrapper forwarded a custom provider's getter.

**After.** Both are removed, and the wrapper no longer forwards the getter. Every provider method takes a trailing `options?: AICallOptions`; report usage through `options?.onMetrics({ model, usage, costUsd, finishReason })`, as described in [Observability](OBSERVABILITY.md#generation-model-usage-and-cost).

**Action.** Custom `AIProvider` implementations: delete the getter and call `onMetrics` per call. An object literal that still has a `getLastGenerationMetrics` property no longer type-checks as `AIProvider`.

## 9. `audioSummary` removed from the voice hook and the Angular component

**Before (2.x).** `useVoiceSearch()` returned `audioSummary` (base64 of the spoken summary). `CommerceAiSearchComponent` had an `audioSummary` property.

**After.**

- React: `useVoiceSearch()` returns `audioClip: Blob | null` only. Replay it with `replayAudioSummary()` or play the `Blob` yourself.
- Angular: `CommerceAiSearchComponent.audioSummary` is removed and the component exposes no audio clip. The replay button, `showVoiceReplay` and `replayVoiceSummary()` are unchanged. (The `audioClip` signal lives on the internal `CommerceAiSearchStore`, which is not public API.)
- The wire field is unchanged: `POST /search/voice` still returns `audioSummary?: string` (inline base64) in `VoiceSearchResponse`.

**Action.**

- React: replace reads of `audioSummary` with `audioClip` (for example `URL.createObjectURL(audioClip)`), or decode the wire field yourself with `audioFromBase64`.
- Angular: to replay the spoken summary, use the built-in replay button or call `replayVoiceSummary()` on the component. A host that needs the audio itself calls `CommerceAiApiService.searchByVoice(...)` (or its own `fetch`) and decodes the `audioSummary` field of the response with `audioFromBase64` from `@commerce-ai-tool/core/client` (add `@commerce-ai-tool/core` to your own dependencies if your package manager does not hoist it).

## 10. Error responses carry a `code`

**Before (2.x).** An error response was `{ "error": string }`, and a 500 carried the internal error message. There was no `ApiErrorCode`, and no Next.js catch-all.

**After.** Every non-2xx response is `{ "error": string, "code": ApiErrorCode }` (types exported from `@commerce-ai-tool/core/client`), a 500 carries a generic per-route message with `code: "INTERNAL"`, and malformed JSON or missing fields are 400 `VALIDATION` instead of 500. `NOT_FOUND` is the code of an unknown path (or a known path with the wrong method) on the Next.js catch-all `createNextRouteHandler`. The browser client recognises every code. The full list is in the [error table](GETTING-STARTED.md#error-responses).

**Action.** Branch on `code`, not on the `error` text. If you branch on `ApiErrorCode` with an exhaustive `switch` or a `Record<ApiErrorCode, ...>`, include every member of the union, `NOT_FOUND` among them. Code that scraped the internal message out of a 500 body no longer finds it; read the server log instead (it is redacted outside `CAT_DEBUG=true`, see [observability](OBSERVABILITY.md)).

## 11. `SearchOrchestrator.getFacetSchema` is required

**Before.** Optional in the type because hosts might implement or mock `SearchOrchestrator`. `createSearchOrchestrator` always provided it, and the server answered 503 when it was missing.

**After.** `getFacetSchema(options?)` is required, and the 503 branch is gone.

**Action.** Hosts that implement or wrap `SearchOrchestrator`, and test doubles typed as it, must provide `getFacetSchema`. Code that uses `createSearchOrchestrator` is unaffected.

## 12. Removed internal exports

Thin wrappers and unreachable modules (`buildProductSearchBody` was exported from the public `@commerce-ai-tool/core` index):

| Removed | Use instead |
|---------|-------------|
| `buildProductSearchBody(interpreted, locale, limit, offset, options)` from `@commerce-ai-tool/core` (and its re-export from the prompts module) | `buildProductSearchRequest({ interpreted, catalogLocale, limit, offset, options })` |
| `src/login-rate-limit` re-export module (`createLoginAttemptLimiter`, `LoginAttemptLimiter`, `clientKeyFromWebHeaders`) of `@commerce-ai-tool/server`, never reachable through a package entry | Configure `loginRateLimit` and `clientKey` (Next.js) or `keyGenerator` (Express) on `createNextHandlers`, `createNextRouteHandler` or `createExpressRouter` |
| The `TTS_SUMMARY_PROMPT` re-export from the internal `search/voice-tts` module | `TTS_SUMMARY_PROMPT` from `@commerce-ai-tool/core/internal` (see [item 13](#13-internal-helpers-moved-to-commerce-ai-toolcoreinternal)) |

Still deprecated, not removed: the `locale` request field and prop (use `queryLocale` and `catalogLocale`), `CAT_DEFAULT_LOCALE` (use `CAT_CATALOG_LOCALE`) and the `ProductSearchQueryBody` type alias (use `ProductSearchRequest` from `@commercetools/platform-sdk`).

## 13. Internal helpers moved to `@commerce-ai-tool/core/internal`

The `@commerce-ai-tool/core` index exported 118 implementation helpers next to the public API, so every internal rename was a semver break. In 3.0.0 the main entry keeps only the API in this list, and the helpers moved to the new subpath `@commerce-ai-tool/core/internal`. **`/internal` has no semver guarantee**: a name or signature there can change or go away in any release, a patch included. The code did not move; only the entry changed (the build now splits shared chunks, so `dist` contains extra `chunk-*` files; the bundles consumers get from `core/client` are unchanged), and `/internal` re-exports (it ships as ESM and CommonJS like the other entries, and shares one module instance with `@commerce-ai-tool/core`, so state such as the Langfuse prompt configuration is not duplicated).

Still exported from `@commerce-ai-tool/core`, unchanged:

- Every type declared in `types/` (config, wire and snapshot types, `ApiErrorCode`, `VoiceMode`, `SearchLocaleOptions`, ...).
- The extension contracts and their types: `AIProvider`, `AICallMetrics`, `AICallOptions`, `AITask`, `PaymentProvider`, `PaymentAuthorizationRequest`, `PaymentAuthorizationResult`, `PaymentMethodOption`, `CommercetoolsClient`, `ProductSearchBuildInput`, `ProductSearchQueryOptions`, `SearchOrchestrator`, `SearchOrchestratorDeps`, and the type `FacetSchemaStore` (type only, because `SearchOrchestratorDeps.facetSchemaStore` is typed with it; the class is in `/internal`).
- The factories: `createAIProvider`, `createCommercetoolsClient`, `createSearchOrchestrator`.
- The error classes hosts may catch: `AIOutputTruncatedError`, `AIRateLimitedError`, `AIUpstreamError`, `CartAccessDeniedError`, `CartNotFoundError`, `InvalidCredentialsError`, `MissingPriceError`, `CheckoutIncompleteError`, `CountryNotAllowedError`, `CurrencyMismatchError`, `OrderNotFoundError`, `PaymentDeclinedError`, `PaymentNotConfiguredError`, `ProductSearchUnavailableError`, `VoiceNotConfiguredError`, `SearchTimeoutError`, `UnsupportedAudioTypeError`.
- The constants and helpers the documentation names: `ANONYMOUS_ID_HEADER`, `CART_SESSION_HEADER`, `MAX_LINE_ITEM_QUANTITY`, `ORDER_NUMBER_PATTERN`, `MAX_TOKENS`, `DEFAULT_OPENROUTER_MODEL`, `DEFAULT_OPENROUTER_VISION_MODEL`, `DEFAULT_OPENROUTER_VOICE_MODEL`, `DEFAULT_BEDROCK_MODEL`, the message helpers (`DEFAULT_COMMERCE_AI_SEARCH_MESSAGES`, `resolveCommerceAISearchMessages`, `formatNamedMessage`) and the facet chip helpers (`toggleFacetFilter`, `isFacetFilterSelected`, `priceRangeToFilterValues`, `priceBucketKeyFromFilters`, `normalizeProductSearchFacets`).
- The deprecated `ProductSearchQueryBody` type alias and the type-only `SUGGESTIONS_*` constants.

Moved to `@commerce-ai-tool/core/internal` (before: `import { name } from "@commerce-ai-tool/core"`; after: `import { name } from "@commerce-ai-tool/core/internal"`; the same applies to `import type`):

| Area | Names |
|------|-------|
| Cart, checkout, orders, payments | `buildCustomerSignin`, `createCartOperations`, `mapCartToSnapshot`, `createCheckoutOperations`, `createCheckoutOrderNumber`, `CheckoutGateway`, `CheckoutOperations`, `CheckoutOperationsOptions`, `ShippingScopeOptions`, `mapOrderToSnapshot`, `createOrderOperations`, `buildAnonymousOrderWhere`, `buildCustomerOrderWhere`, `buildOwnerOrderWhere`, `buildOwnerOrdersWhere`, `OrderGateway`, `OrderOperations`, `createPaymentOperations`, `createPaymentKey`, `PaymentGateway`, `PaymentOperations` |
| Facets and colors | `FacetSchemaStore` (the class; the type stays public), `resolveFacetSchema`, `buildProductSearchFacets`, `buildProjectionFacetParams`, `filterFacetSuggestions`, `CATEGORIES_FACET_ID`, `DEFAULT_PRICE_RANGES`, `PRICE_FACET_ID`, `formatFacetBucketLabel`, `hexColorSwatchValue`, `isColorLikeFacetName`, `isHexColorFacetKey` |
| Product Search building | `buildProductSearchRequest`, `buildProjectionSearchQueryArgs`, `hasSearchableContent`, `joinSearchTerms`, `PRIMARY_TERM_BOOST_MULTIPLIER` |
| Search keywords | `buildSearchKeywordsFromProductCopy`, `hasNonEmptySearchKeywords`, `BuildSearchKeywordsFromProductCopyInput`, `BuildSearchKeywordsFromProductCopyResult`, `BuiltSearchKeywords`, `LocalizedTextMap`, `WhitespaceSearchKeyword` |
| Suggestions | `isSuggestiblePhrase`, `SUGGESTION_MAX_LENGTH`, `SUGGESTION_MAX_WORDS`, `clampSuggestionsLimit`, `normalizeSuggestionList`, `normalizeSuggestionsPrefix`, `resolveSuggestLocale`, `resolveSuggestLocales`, `shouldUseAiSuggestionFallback`, `suggestionPrefixes`, `suggestionMatchesQueryTokens`, `filterSuggestionsByQueryTokens`, `AI_SUGGESTION_FALLBACK_MIN_LENGTH`, `SUGGESTIONS_MAX_PREFIX_LENGTH` |
| Missions, voice, locales | `looksLikeCompoundShoppingList`, `looksLikeShoppingList`, `isUsableMission`, `resolveMissionOptions`, `resolveVoiceMode`, `resolveSearchLocales`, `buildTtsSummaryFallback`, `buildTtsSummaryUserMessage`, `truncateTtsText`, `MAX_TTS_CHARS`, `SUPPORTED_AUDIO_MIME_TYPES` |
| Query handling | `isLikelyProductQuery`, `localesShareLanguage`, `mergeInterpretedSearchTerms`, `relaxInterpretedSearch`, `dropSoftFilters`, `hasSoftFilters` |
| Prompts and parsers | `parseInterpretedQuery`, `parseVoiceAudioInterpretation`, `parseVoiceTranscriptInterpretation`, `parseSuggestSearchTerms`, `parseDecomposedMission`, `buildRefineQueryUserMessage`, `buildSchemaAwareTextQueryUserMessage`, `buildSuggestSearchTermsUserMessage`, `TTS_SUMMARY_PROMPT`, `REFINE_QUERY_SYSTEM_PROMPT`, `MAX_MISSION_INTENTS`, `MAX_QUERY_CHARS`, `MAX_INTERPRETED_SEARCH_TERMS`, `SYSTEM_PROMPT_NAMES`, `SYSTEM_PROMPT_CATALOG`, `getLocalSystemPrompt`, `listSystemPromptEntries`, `SystemPromptName`, `resolveSystemPrompt`, `resolveAndLinkSystemPrompt`, `linkActiveGenerationPrompt`, `configureLangfusePrompts`, `ResolvedSystemPrompt`, `ResolvedSystemPromptSource` |
| Tracing and utilities | `logSearchTrace`, `createRandomUuid`, `isLangfuseEnabled`, `isLangfusePromptsEnabled`, `shouldExposeTraceId`, `shouldTraceSuggestions`, `getCurrentTraceId`, `withPipelineSpan`, `withPropagatedAttributes`, `withTraceSession`, `withTraceIdMeta`, `wrapAIProvider`, `redactBinaryInput`, `redactBase64ImageInput`, `AIProviderTraceMeta`, `PipelineSpanAttributes`, `PropagatedTraceMetadata`, `RedactedBinaryInput` |

**Action.** Search your host for imports of the names above from `@commerce-ai-tool/core` and switch the specifier, accepting that `/internal` can change without a major release. Prefer a supported replacement where there is one: `hexColorSwatchValue`, `isColorLikeFacetName`, `looksLikeCompoundShoppingList`, `looksLikeShoppingList` and `createRandomUuid` are also exported by the browser-safe `@commerce-ai-tool/core/client`, which keeps its semver guarantee. `MAX_QUERY_CHARS` and `MAX_TTS_CHARS` are enforced by the server (400 `VALIDATION`), so a UI limit is better read from your own copy of those values than imported. Code that only uses the public API above, and `@commerce-ai-tool/core/client`, is unaffected.

## 14. Angular package format: ESM only, new peer range

**Before (2.x).** `@commerce-ai-tool/angular` shipped an esbuild bundle with raw decorators, a `require` (CommonJS) entry, and peers `@angular/core`, `@angular/common` and `@angular/forms` `>=17`. AOT applications could not compile it as a library.

**After.**

- The package is an Angular Package Format library built with ng-packagr in partial compilation mode (Angular 20.3 compiler); your Angular CLI links it against your own Angular version.
- The peer range is `^20.3.0 || ^21.0.0 || ^22.0.0`. Hosts on Angular 19 or older, or on 20.0 to 20.2, must upgrade Angular first, or stay on `@commerce-ai-tool/angular` 2.x. Angular 22 is declared but not part of the CI matrix.
- ESM only: there is no `require` condition or CommonJS entry. The package exposes one entry, `@commerce-ai-tool/angular`, plus `@commerce-ai-tool/angular/styles.css` (same stylesheet content).
- `@commerce-ai-tool/core` is a regular dependency of the Angular package; the library imports only `@commerce-ai-tool/core/client`.
- Zoneless is supported: the widgets work with `provideZonelessChangeDetection()`, in `OnPush` hosts and without a `zone.js` polyfill.
- `CommerceAiApiService` and `CommerceAiCartService` read the new `COMMERCE_AI_FETCH` token with `inject()`, so they must be created through dependency injection: `new CommerceAiApiService()` outside an injection context throws NG0203 (use `inject()`, or `TestBed.runInInjectionContext` in tests). The token (default: the global `fetch`) lets a host add headers, rewrite the base URL or log requests.
- `CommerceAiApiService` methods keep their signatures (`searchByImage`, `searchByVoice` and `synthesizeSpeech` gain a trailing optional `signal`) and now reject with `CommerceAIApiError` (`status`, `code`) instead of a generic `Error`.
- Errors the widget shows (search, image, voice, camera, cart) come from the `messages` input, never from server or browser text; the `displayCartError` helper is removed (it was not exported from the package entry).

**Action.** Check the Angular version of every host. Replace `new CommerceAiApiService()` / `new CommerceAiCartService()` with injection, and catch `CommerceAIApiError` where you caught a plain `Error`. A CommonJS consumer of the Angular package (rare, Angular CLI builds use ESM) must switch to ESM or stay on 2.x.

## 15. Visual and DOM changes in the React and Angular widgets

None of these change an API signature, but they change what users and tests see. Skim the list, then search your host CSS and end-to-end tests for the selectors it names.

- **Colours (WCAG 2.2 AA, both themes).** The light accent is `#4f46e5` (was `#6366f1`), secondary text is slightly darker, error text is `#b91c1c` (light) and `#f87171` (dark), filled accent controls draw dark text on the dark theme, and the "added" states (including the mission "Add all" button) and the order-confirmed icon use the new `--cat-success`. New public tokens on `.cat-root`: `--cat-accent-contrast`, `--cat-error`, `--cat-success`, `--cat-cart-panel-bg`, `--cat-z-dropdown`, `--cat-z-panel`, `--cat-z-overlay`. Every earlier `--cat-*` variable keeps its name, and a host that sets its own `--cat-accent` keeps its colour; set `--cat-accent-contrast` too when white (light) or near-black (dark) text is not readable on it. See [theming](GETTING-STARTED.md#theming).
- **Accessible names now name the product.** "Add to cart" is "Add {name} to cart", "Remove item" is "Remove {name} from cart", and the quantity buttons sit in a `role="group"` named "Quantity of {name}" (the value is a `role="status"`). Selectors that match the old exact names stop finding the buttons, and a name substring such as `getByRole("button", { name: "Running shoe" })` now matches the select button and the add button; anchor it (`/^Running shoe/`). A host that translated `addToCart` or `removeItem` keeps its wording (`"<text>: <product name>"`) until it also sets the new `addToCartNamed`, `removeItemNamed` and `quantityFor` keys.
- **Voice, cart and camera controls.** The voice button and the cart toggle no longer set `aria-pressed` (the voice button's name changes instead; the cart toggle keeps `aria-expanded`). Decorative icons are `aria-hidden`; the Angular product placeholder is an icon instead of an emoji.
- **Camera overlay is a native modal `<dialog>`** in both widgets (`dialog.cat-camera-overlay`; it was a `div` in React). The page behind it is inert, Tab wraps, Escape closes it or dismisses the camera error, and focus returns to the camera button.
- **Cart sheet.** The cart closes on Escape at every width and returns focus to the cart toggle. At 36rem and below, where it is a full-screen sheet, it is a `role="dialog"` with `aria-modal`, takes focus on open and wraps Tab. The quantity "+" button is disabled at 99, the maximum the server accepts. An Escape that dismisses the open autocomplete listbox does not also close the cart.
- **Search markup.** One always-mounted, visually hidden live region (`role="status"`, class `cat-visually-hidden`) announces listening, searching, the result count and suggestion states. Search and voice errors use `role="alert"`; the voice timer is `role="timer"`. With `enableAutocomplete` the input is a combobox whose listbox is a `<ul role="listbox">` with `<li role="option">` children (they replace `<button role="option">`); host CSS that targeted `button.cat-suggestions__item` should target `.cat-suggestions__item` and `.cat-suggestions__list`. Listbox and option ids are unique per widget instance, so two widgets on one page no longer share ids.
- **Form fields** use at least 16px on viewports 36rem wide or narrower and on touch devices, so iOS Safari does not zoom on focus.
- **Default checkout landmarks (React).** `CommerceAICheckout` and `CommerceAIOrderStatus` no longer render a `<main>`: the root is a `<section>` named by the widget title, with an `<h2>` title and `<h3>` sections (`<h4>` for the billing address), so they fit inside the host's own `<main>`. Pass `as="main"` and `headingLevel={1}` to keep the old `<main>`/`<h1>` structure. They also accept `renderLink` for router-aware links. The Angular package has no checkout components.

**Action.** Update end-to-end selectors and host CSS that target the names, tags and classes above; check the contrast of a custom `--cat-accent`; pass `as="main"` where a checkout page relied on the widget being the page's `<main>`.

## 16. Behaviour changes that may need action

Each line is a behaviour that changed without an API signature change; the CHANGELOG entry or doc linked from it has the detail.

- **Rate limits and caps on every route.** `/search`, `/search/voice`, `/search/image` and `/tts` share 30 requests per minute per client, `/search/suggestions` has its own bucket (`suggestionsRateLimit`), login is also limited per email, and JSON `POST` routes return 415 unless `Content-Type` is `application/json`. Input caps (query length, `searchTerms`, quantities, body and upload sizes) answer 400 or 413. Limited requests return 429 `RATE_LIMITED`. See [rate limits and input caps](CONFIGURATION.md#rate-limits-and-input-caps). Custom clients must send `Content-Type: application/json`.
- **Express behind a proxy.** The router no longer overrides express-rate-limit's key generator, so set `app.set("trust proxy", n)` (n is the number of proxies) or every shopper is limited as one IP. Never set `trust proxy` to `true`. Next.js keys on the right-most `X-Forwarded-For` entry; pass `clientKey` if your platform differs.
- **Startup validation of the environment.** A set but invalid numeric or enum variable (for example `CAT_AI_PROVIDER`, `CAT_VOICE_MODE`, `CAT_CACHE_TTL_MS`, `LANGFUSE_PROMPT_CACHE_TTL_SECONDS`), an invalid `CAT_VOICE_LLM_SUMMARY`, or a `CAT_SUPPORTED_LOCALES` with no valid entry now fails at startup instead of being passed through. See [configuration](CONFIGURATION.md).
- **Voice summary is no longer LLM-written by default.** `ttsText` is a deterministic sentence; set `CAT_VOICE_LLM_SUMMARY=true` to keep the LLM summary.
- **OpenRouter vision model.** A host that set `OPENROUTER_MODEL` without `OPENROUTER_VISION_MODEL` now gets the default vision model for images. Set `OPENROUTER_VISION_MODEL` to keep a specific one.
- **Langfuse-managed prompts** (`LANGFUSE_PROMPTS=true`) that no longer contain their required phrases are ignored in favour of the local prompt; re-sync with `pnpm sync:langfuse-prompts`. Langfuse 6 needs self-hosted Langfuse 4.59 or newer and Node.js 22 or newer. See [observability](OBSERVABILITY.md).
- **Debug logging and 500 bodies.** `CAT_DEBUG=true` is the only switch for verbose logs and `meta.timings` (`NODE_ENV` no longer enables them), and 500 responses carry a generic message (item 10).
- **commercetools API client scopes.** The client no longer requests `manage_project`; with no scopes configured the token gets the scopes of the API client. Set `CTP_SCOPES` (`commercetools.scopes`) to pin them, see [configuration](CONFIGURATION.md).
- **Guest orders and order numbers.** Guest orders placed before sign-in are no longer reassigned to the customer. `orderNumber` must match `ORDER_NUMBER_PATTERN`. Checkout sets the cart country from the shipping address, and `cartPolicy` can reject countries or currencies, so `POST /cart/addresses`, `/cart/payment` and `/cart/order` can answer 400 `MISSING_PRICE` or `VALIDATION`.
- **Locales.** Invalid `queryLocale`, `catalogLocale` and `locale` values (for example `en_GB`) are replaced by the configured default; `CAT_SUPPORTED_LOCALES` can restrict clients to an allowlist.
- **Logout route.** Next.js hosts with their own logout route should pass the request: `POST(req) { return handlers.logout(req); }`, so `onLogout` runs for the session token.
- **Package files.** The `dist/*.d.cts` files are no longer published (the `require` conditions point at `dist/cjs/`); a deep import of one stops resolving.

## Verification checklist

1. Start with the new `CAT_CART_SESSION_SECRET` and your real `NODE_ENV` (also unset or `staging`): the server starts; remove the variable and it refuses to.
2. Sign in, add to cart, reload: the session survives. Sign out and in again after the secret change.
3. A guest cart loads (the browser sends `x-commerce-ai-anonymous-id`).
4. A search on a project without Product Search answers 503 `UPSTREAM_UNAVAILABLE` ("Product search is not available") and logs "Product Search API is not enabled for project ..." unless you opted in to the fallback.
5. `pnpm typecheck` in your host reports no use of the removed members above and no import of a moved helper from `@commerce-ai-tool/core` (item 13).
6. Angular hosts: the build resolves `@commerce-ai-tool/angular` on your Angular version (item 14), and your end-to-end tests still find the widget controls by their new names (item 15).
