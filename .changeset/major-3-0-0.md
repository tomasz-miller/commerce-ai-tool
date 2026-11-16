---
"@commerce-ai-tool/core": major
"@commerce-ai-tool/server": major
"@commerce-ai-tool/react": major
"@commerce-ai-tool/angular": major
---

3.0.0: secure defaults and removal of 2.x APIs. Every item has before/after and the action for hosts in [docs/MIGRATION-3.0.md](https://github.com/tomasz-miller/commerce-ai-tool/blob/main/docs/MIGRATION-3.0.md).

Breaking, security defaults:

- `createCommerceAIServer` (and so `createNextHandlers`, `createNextRouteHandler` and `createExpressRouter`) throws when `CAT_CART_SESSION_SECRET` (`config.cartSession.secret`) is set but shorter than 32 bytes (UTF-8 length of the trimmed value), in every environment, and when it is missing unless `NODE_ENV` is exactly `development` or `test` (an unset `NODE_ENV` or `staging` throws). The commercetools client secret is no longer a fallback signing key. Only in `development` and `test` does an unset secret become a random per-process one with a warning. `cartSessionSecret` on the server object is non-enumerable. Switching from the fallback to a dedicated secret signs every shopper out once.
- Session tokens without `iat` (every token issued by 2.x) are rejected with 401 `SESSION_INVALID`, as are tokens with a negative or non-numeric `iat` or one more than 60 seconds in the future.
- The guest id for `GET /cart`, `/cart/shipping-methods`, `/cart/payment-methods` and `/orders` is read from the `x-commerce-ai-anonymous-id` header only; the `anonymousId` query parameter is ignored.
- `CAT_LEGACY_PRODUCT_PROJECTION_SEARCH` (`commercetools.legacyProductProjectionSearch`) defaults to `false`: without Product Search the search fails with a typed `ProductSearchUnavailableError`, which the server maps to 503 `UPSTREAM_UNAVAILABLE` ("Product search is not available"; the log names the project and the Merchant Center setting). Set it to `true` to keep the deprecated fallback.
- `@commerce-ai-tool/react` requires `react` and `react-dom` `>=19` (was `>=18`).

Breaking, removed API:

- `cartVersion` is removed from `CartMutationRequest`, the server parsing and the React and Angular widgets (a body that still sends it is accepted and the field ignored).
- `CheckoutGateway.updateOrder` (and the `CheckoutGateway` type itself leaves the public entry, see below), `AIProvider.getLastGenerationMetrics`, the `GenerationMetrics` type and the Langfuse wrapper's passthrough of that getter are removed; report usage through `AICallOptions.onMetrics`.
- React `useVoiceSearch().audioSummary` and Angular `CommerceAiSearchComponent.audioSummary` are removed; use `audioClip` (React) or the replay button (`replayVoiceSummary()`, Angular, which exposes no audio clip). The `audioSummary` field of the `POST /search/voice` response is unchanged.
- Every non-2xx response carries a `code` (`ApiErrorCode`, including the new `NOT_FOUND` for an unknown path on the Next.js catch-all), and 500 bodies are generic.
- `SearchOrchestrator.getFacetSchema` is required in the type.
- `buildProductSearchBody` is removed from `@commerce-ai-tool/core` (use `buildProductSearchRequest`), and the server's unreachable `login-rate-limit` re-export module is deleted.
- 118 implementation helpers (builders, parsers, prompt utilities, commercetools operations, tracing helpers, ...) moved from the `@commerce-ai-tool/core` index to the new `@commerce-ai-tool/core/internal` subpath, which has no semver guarantee. The main entry keeps the config and wire types, the `AIProvider`, `PaymentProvider`, `CommercetoolsClient` and `SearchOrchestrator` contracts, the factories, the error classes, the documented constants and the message and facet chip helpers. The full before/after list is in item 13 of the migration guide. `@commerce-ai-tool/core/client` is unchanged. The core build now splits shared chunks, so `dist` gains `chunk-*` files; the code consumers bundle from `core/client` is unchanged.

Breaking, Angular package: `@commerce-ai-tool/angular` is an Angular Package Format library, ESM only (no CommonJS or `require` entry), with peers `@angular/core`, `@angular/common` and `@angular/forms` `^20.3.0 || ^21.0.0 || ^22.0.0` (was `>=17`). `CommerceAiApiService` and `CommerceAiCartService` must be created through dependency injection (`new` outside an injection context throws NG0203), and `CommerceAiApiService` now rejects with `CommerceAIApiError`. The widgets are zoneless-ready.

Visual and DOM changes in both widgets (colours and tokens, accessible names, landmarks, the camera overlay and cart sheet as dialogs, combobox markup, live regions) and further behaviour changes (rate limits and 415 on JSON routes, startup validation of environment variables, Express `trust proxy`, deterministic voice summaries, default OpenRouter vision model, scopes of the commercetools client, Langfuse 6) are listed per topic in the entries below and in items 14 to 16 of the migration guide.

Documented behaviour: `POST /cart/logout` answers 200 for a missing, invalid, expired or revoked token and 500 when an `isRevoked` or `onLogout` hook throws.
