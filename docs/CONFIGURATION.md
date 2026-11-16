# Configuration

Locales, models, and environment variables. Host apps load secrets with `loadConfigFromEnv()` on the server.

[Documentation index](README.md) · [Getting started](GETTING-STARTED.md) · [Search pipeline](SEARCH-PIPELINE.md)

## Locales

| Field | Purpose | Source |
|-------|---------|--------|
| `catalogLocale` | Language products are indexed in commercetools (`fullText.language`, card names) | `CAT_CATALOG_LOCALE`, widget `catalogLocale` prop |
| `queryLocale` | Language the shopper types or speaks (AI input, `interpretation`, TTS) | Widget `queryLocale` / request body; defaults to `catalogLocale` |

The AI translates `searchTerms` into the catalog language. Product names in results use `catalogLocale`.

Set `CAT_CATALOG_LOCALE` to a locale that exists on products (for example `en-GB` or `en-US` — not bare `en` unless that locale is on the catalog).

`CAT_DEFAULT_LOCALE` is a deprecated alias for `CAT_CATALOG_LOCALE`.

The server validates every locale a client sends (`queryLocale`, `catalogLocale`, the deprecated `locale`, and the cart, checkout, payment and order `catalogLocale`). A value must be a canonical BCP 47 tag (`en-GB`, not `en_GB`); anything else is replaced by a default instead of being rejected.

- `catalogLocale` that is invalid (or outside the allowlist, below) falls back to the configured catalog locale.
- `queryLocale` is the shopper's own spoken or typed language, so it only gets the canonical-form check and is never matched against the allowlist. A Polish shopper on an `en-GB,de-DE` catalog stays `pl-PL`. An invalid or absent `queryLocale` falls back to the request's resolved `catalogLocale`.

Set `CAT_SUPPORTED_LOCALES` (comma-separated, for example `en-GB,de-DE`) to restrict **catalog locales** to that list. The allowlist constrains catalog locales only. Matching is case-insensitive and the list's spelling is used (`de-de` becomes `de-DE`). Entries are canonicalised once at startup. An entry that is not a valid BCP 47 tag (for example `en_GB`) is dropped with a single warning naming it. If the variable is set but no entry is valid, startup fails with `Invalid CAT_SUPPORTED_LOCALES: no valid locale in ...` rather than silently removing the restriction. Without it, any well-formed locale is accepted.

Resolver: `packages/core/src/locale/resolve.ts`. Pipeline details: [search pipeline](SEARCH-PIPELINE.md).

## Widget messages

The widgets take a `messages` prop (`Partial<CommerceAISearchMessages>`) and fill every key you leave out from `DEFAULT_COMMERCE_AI_SEARCH_MESSAGES` (English). Keys added after 2.5.0 (`microphoneDenied`, `microphoneUnavailable`, `cameraDenied`, `cameraNotFound`, `cameraInUse`, `cameraUnavailable`, `rateLimited`, `resultsCount`, `cartLoadFailed`, `addToCartNamed`, `removeItemNamed`, `quantityFor`) are optional in `CommerceAISearchMessages`, so a complete translation object written against 2.5.0 still type-checks and shows the English text for those keys until you translate them. Two of them are derived instead: when you override `addToCart` or `removeItem` but not `addToCartNamed` / `removeItemNamed`, the widgets use `"<your text>: {name}"`, so your wording is kept. A host that builds its object by spreading `DEFAULT_COMMERCE_AI_SEARCH_MESSAGES` and overriding `addToCart` already carries the English `addToCartNamed`, so no derivation happens: translate the Named key as well. Entries set to `undefined` count as not overridden. `resolveCommerceAISearchMessages(overrides)` returns `ResolvedCommerceAISearchMessages` (`Required<CommerceAISearchMessages>`, every key present); use that type when your own code reads keys. The exported `MissionResults` (React) and `CommerceAiMissionResultsComponent` / `CommerceAiCartPanelComponent` (Angular) accept `CommerceAISearchMessages` and resolve it themselves; `messageForError` and `getCameraErrorMessage` do the same.

### Screen-reader announcements

Each search widget renders one always-mounted, visually hidden live region (`role="status"`, `aria-live="polite"`, class `cat-visually-hidden`). It is filled from the `messages` keys `listening`, `understandingQuery`, `preparingAudioSummary`, `searching`, `resultsCount` (`{count}` is the number of products), `noProductsFound` and `noSuggestions`, so translating those keys also translates what a screen reader announces. Search and voice errors use `role="alert"` and are not repeated in the live region. The autocomplete input is a combobox (`role="combobox"`) only when `enableAutocomplete` is on; its listbox contains only `<li role="option">` items and is rendered only while there are suggestions.

## Default OpenRouter models

Override with env:

| Variable | Default | Role |
|----------|---------|------|
| `OPENROUTER_MODEL` | `openai/gpt-5.6-luna` | Text interpretation |
| `OPENROUTER_VISION_MODEL` | `google/gemini-3.7-flash` | Image search |
| `OPENROUTER_VOICE_MODEL` | `google/gemini-3.7-flash` | Direct audio interpretation |

`OPENROUTER_VISION_MODEL` and `OPENROUTER_VOICE_MODEL` fall back to their own defaults above, never to `OPENROUTER_MODEL`: a host that sets only `OPENROUTER_MODEL` still sends images to `google/gemini-3.7-flash`. Set `OPENROUTER_VISION_MODEL` to use another vision model.

Structured interpretation uses OpenRouter `json_schema` with `temperature: 0`. When a model answers 400 saying `json_schema` (or `response_format`) is unsupported, the call is retried once with `json_object` plus the schema in the prompt, and that model goes straight to `json_object` for the life of the provider instance. Set `OPENROUTER_JSON_SCHEMA=false` to skip json_schema entirely. Compare cheaper models with `pnpm eval:models` before changing these defaults.

## AI timeouts, retries, token caps and cancellation

Each pipeline step has its own timeout (`CommerceAIConfig.timeouts`). A step that runs out returns 504 `TIMEOUT`, and its in-flight AI call is aborted, so no tokens are spent after the 504.

| Step | `timeouts` key | Default |
|------|----------------|---------|
| Text interpretation, refine, missions, AI suggestions, voice transcript interpretation, voice enhance, TTS summary | `aiTextMs` | 15 s |
| Direct audio interpretation, ElevenLabs STT | `aiVoiceAudioMs` | 20 s |
| Image interpretation | `aiImageMs` | 15 s |
| Product Search and projections | `commercetoolsMs` | 8 s |
| commercetools Suggest | `commercetoolsSuggestMs` | 3 s |

OpenRouter calls go through `@openrouter/sdk` 1.x (no raw `fetch`). The SDK retries 429, 5xx and connection resets with exponential backoff: 250 ms × attempt², plus up to 1 s jitter, each delay capped at 2 s (a provider `Retry-After` too). No new retry starts after 4 s, so the retries fit inside the 15 s step. If you lower `aiTextMs` below about 6 s, the step timeout cuts retries short. The SDK's own 20 s per-attempt timeout applies only to direct `AIProvider` calls without a signal; the orchestrator always passes one.

Output-token caps (`maxCompletionTokens`, exported as `MAX_TOKENS`). Every OpenRouter call also sends `reasoning: { effort: "low" }`. The caps include reasoning tokens, which reasoning models such as the default `openai/gpt-5.6-luna` spend before the visible answer, so they are set well above the answer size.

| Task | Cap |
|------|-----|
| `interpret`, `refine`, `image`, `mission`, `voiceAudio`, `voiceTranscript` | 2000 |
| `suggest` | 1000 |
| `enhance`, `ttsSummary` | 600 |

A response cut by the cap (`finish_reason: "length"`) is not repaired. It throws `AIOutputTruncatedError`, and the route returns 503 `UPSTREAM_UNAVAILABLE`. The billed call is still reported to Langfuse. Mission, AI suggestion and TTS summary failures fall back as before (single search, no suggestions, template summary).

Provider errors use fixed messages, and the provider body is never sent to the browser: an OpenRouter 429 after retries → 429 `RATE_LIMITED` (`AIRateLimitedError`); 402 (credits), 5xx after retries or a failed connection → 503 `UPSTREAM_UNAVAILABLE` (`AIUpstreamError`).

Cancellation: the Next.js handlers pass `req.signal`, and the Express router aborts when the response closes before it finished (it listens on `res`, not `req`). A client that cancels a search (for example a superseded keystroke) stops the remaining AI and commercetools steps; such requests end with status 499 (whatever error the cut-short step raised, once the request signal has aborted) and are not logged as errors. Results assembled during an abort are never cached. Bedrock calls take the signal (`client.send(command, { abortSignal })`); ElevenLabs calls do not yet, so the pipeline still stops at the next step there.

## Bedrock (Converse)

`CAT_AI_PROVIDER=bedrock` calls the Bedrock Converse API (`ConverseCommand`) for text, refine, image, mission, suggestions, voice transcript interpretation, voice enhance and TTS summary. Direct audio interpretation is OpenRouter-only.

- **Default model is legacy; set `BEDROCK_MODEL_ID`.** The built-in default is still `anthropic.claude-3-5-sonnet-20241022-v2:0`, kept so a minor update does not change where requests are processed. That model is not listed on the AWS "Models at a glance" page any more, so your account may no longer be able to invoke it. Set `BEDROCK_MODEL_ID` (and `BEDROCK_VISION_MODEL_ID`) to a current inference profile ID. Newer Claude models need a profile ID, not the bare model ID. The two options differ in data residency:
  - **Geo profile**, for example `eu.anthropic.claude-sonnet-5-5` or `us.anthropic.claude-sonnet-5-5` (`au.` also exists). Requests stay inside that geography; the destination Regions depend on the Region you call from (check with `GetInferenceProfile`). Use this when you have residency requirements, for example EU retail.
  - **Global profile**, `global.anthropic.claude-sonnet-5-5`. Requests may be processed in any commercial Region. Use it only when you have no residency constraints.
  - Source: AWS Bedrock user guide, model card `model-card-anthropic-claude-sonnet-5-5.html` (checked 2026-11-13): Claude Sonnet 5.5, lifecycle Active, model ID `anthropic.claude-sonnet-5-5`, Converse, image input and structured outputs supported, geo IDs `us.`/`eu.`/`au.` and global ID as above.
  - The IAM policy must allow `bedrock:InvokeModel` on the inference profile and on the foundation models behind it.
  - Not verified with this code against a live account: Claude 5 models think adaptively by default and thinking counts toward `maxTokens`, so the caps below may truncate output (every call would then fail with 503), and whether `temperature: 0` is accepted with thinking on. Run `pnpm eval:promptfoo` with the Bedrock columns on your chosen model first. Changing the built-in default is planned for 3.0.0.
- **Role separation:** the resolved system prompt is sent in `system: [{ text }]`. Only the shopper's text (and the image) goes in the user turn, so injected text has no system authority.
- **Determinism and caps:** `inferenceConfig` is `{ maxTokens, temperature: 0 }`, with the same per-task `maxTokens` as OpenRouter (`MAX_TOKENS`, table above). `stopReason: "max_tokens"` throws `AIOutputTruncatedError` (503 `UPSTREAM_UNAVAILABLE`) after usage is reported. Claude 5 models think adaptively by default and thinking counts toward `maxTokens`; if truncation errors appear in Langfuse (`finishReason: max_tokens`), pin a model without default thinking or raise the caps.
- **Structured output:** JSON methods send the schema in `outputConfig.textFormat` (`json_schema`) and keep the schema in the prompt as well. If the model answers `ValidationException` (for example it does not support structured outputs), the call is retried once without `outputConfig`; the model is skipped for `outputConfig` for the life of the provider instance only when that retry succeeds. Plain-text methods (voice enhance, TTS summary) return the model text as is, with no JSON extraction.
- **Retries and cancellation:** the client sets `maxAttempts: 3` (the SDK default, set explicitly). Backoff between attempts is well under a second, and the step timeout or a cancelled request aborts a call in flight through `abortSignal`, so the retries fit inside the 15 s `aiTextMs`.
- **Errors:** `ThrottlingException` and `ServiceQuotaExceededException` map to `AIRateLimitedError` (429 `RATE_LIMITED`); `ServiceUnavailableException`, `InternalServerException`, `ModelNotReadyException` and `ModelTimeoutException` map to `AIUpstreamError` (503 `UPSTREAM_UNAVAILABLE`), after the SDK's own retries. The AWS message is never sent to the browser. Validation and access-denied errors pass through unchanged (host misconfiguration, generic 500).

## Voice search TTS

Spoken summaries are **voice-search only** (text and image search stay visual).

- Auto-play and replay appear only after a voice search
- Summary language follows `queryLocale`
- By default the summary is a fixed sentence per language (`buildTtsSummaryFallback`: result count and the top product name as indexed), with no LLM call. Set `CAT_VOICE_LLM_SUMMARY=true` (`CommerceAIConfig.voice.llmSummary`) to have the LLM write it (`summarizeVoiceResults`, one extra call per voice search); the template is still used if that call fails
- With `CAT_VOICE_LLM_SUMMARY=true`, product names in the spoken summary are translated to `queryLocale` when they differ from the catalog language
- Set `queryLocale` on the widget (or `NEXT_PUBLIC_CAT_QUERY_LOCALE` in the demo) to match the language you speak

## Environment variables

See [`apps/demo-next/.env.example`](../apps/demo-next/.env.example) (and the Angular BFF's [`.env.example`](../apps/demo-angular/.env.example)) for copy-paste templates. `loadConfigFromEnv()` reads the variables below.

**Validation at boot.** An unset or empty variable uses its default. A numeric variable must be a positive integer (`CAT_MISSIONS_MIN_CONFIDENCE` a number from 0 to 1; `CAT_CACHE_TTL_MS`, `LANGFUSE_PROMPT_CACHE_TTL_SECONDS` and `LANGFUSE_PROMPT_MAX_RETRIES` may also be `0`), and `CAT_AI_PROVIDER` / `CAT_VOICE_MODE` / `CAT_VOICE_LLM_SUMMARY` must be one of the listed values. Anything else makes `loadConfigFromEnv()` throw `Invalid <NAME>: ...` at startup instead of changing behaviour silently. Feature settings (`CAT_MISSIONS_*`, `CAT_FACET*`, `CAT_CACHE_MAX_ENTRIES`) are only parsed when their feature is on.

### commercetools

| Variable | Default | Meaning |
|----------|---------|---------|
| `CTP_PROJECT_KEY`, `CTP_CLIENT_ID`, `CTP_CLIENT_SECRET`, `CTP_REGION` | required | commercetools API credentials and region |
| `CTP_SCOPES` | unset | Space-separated OAuth scopes for the access token, each as `scope:projectKey` (see [least-privilege API client](#least-privilege-api-client)), mapped to `config.commercetools.scopes`. Unset or blank omits the `scope` parameter, so the token gets exactly the scopes of the API client. A scope the API client does not have makes the token request fail with `invalid_scope` |
| `CAT_LEGACY_PRODUCT_PROJECTION_SEARCH` | `false` | Must be `true` or `false`; mapped to `config.commercetools.legacyProductProjectionSearch`. Off by default since 3.0.0: when Product Search is not enabled on the project the search fails with "Product Search API is not enabled ...". `true` opts in to the deprecated Product Projection Search fallback and logs a deprecation warning once per process. See [Product Search availability](#product-search-availability) |
| `CAT_STORE_KEY` | unset | Reserved for future store-scoped search (not applied until store scope is enabled in core) |

#### Least-privilege API client

The client used to always request `manage_project`, a full-admin scope. It now requests no scope unless `CTP_SCOPES` / `config.commercetools.scopes` is set, so the token carries exactly the scopes of the API client you create in the Merchant Center. Create a dedicated API client with these scopes (replace `<projectKey>`; each scope is `scope:<projectKey>`). The list was checked against the per-endpoint "OAuth 2.0 Scopes" sections of the commercetools API reference and the [Scopes](https://docs.commercetools.com/api/scopes) page.

| Scope | Needed for | Endpoint reference |
|-------|-----------|--------------------|
| `view_published_products:<projectKey>` | Product Search (`POST /products/search`); GraphQL `masterData.current`; Product Projections REST hydrate and fallback (also accepted there: `view_products`) | Search Products lists only this scope |
| `view_products:<projectKey>` | GraphQL (`POST /graphql`, used for card hydrate and category names); Product Types (also accepted: `view_product_types`); Categories (also accepted: `view_categories`) | GraphQL lists only this scope |
| `manage_orders:<projectKey>` | Create, read and update Carts (`/carts`); create and read Orders (`/orders`); matching shipping methods for a cart (the endpoint accepts `view_orders`, `view_shipping_methods` or `manage_my_orders`; `manage_orders` includes `view_orders`) | Create Cart, Create Order |
| `manage_payments:<projectKey>` | Create Payments and read them by id or key (the read endpoints accept `view_payments`, which `manage_payments` includes) | Create Payment |
| `manage_customers:<projectKey>` | Customer sign-in (`POST /login`). Only needed when the host enables sign-in; omit it otherwise | Authenticate (sign in) Customer lists only this scope |

Notes:

- `manage_customers` is broader than sign-in needs (it also lets the token read and change customers), but commercetools documents no narrower scope for `POST /login` with a client-credentials token. The `manage_my_profile` scope belongs to `/me/login`, which this library does not call. Keep the BFF authorization checks (`assertCartOwner`, `where` predicates) in place.
- Do not add `manage_project`, `manage_products` or other `manage_*` scopes beyond this list. The `searchKeywords` seed script (`pnpm seed:search-keywords -- --apply`) writes products and needs `manage_products` on its own, separate API client.
- Passing `CTP_SCOPES` explicitly (rather than relying on the API client defaults) pins the token scopes in version control. Example:

```bash
CTP_SCOPES="view_published_products:my-project view_products:my-project manage_orders:my-project manage_payments:my-project manage_customers:my-project"
```

#### Request timeout and retries

The commercetools HTTP client is `@commercetools/ts-client` (the v2 client it replaced is deprecated). It is built twice from the same credentials, sharing one access token, because reads and mutations need different retry rules. Every request, and the token request, times out after 10 s.

| Requests | Retried | Not retried |
|----------|---------|-------------|
| Reads, Product Search (`POST /products/search`), GraphQL (`POST /graphql`) | up to 3 times with exponential backoff (200 ms base, 5 s cap) on `500`, `502`, `504`, on a timeout (`retryOnAbort`), and, always, on `429` (only when the server says how long to wait) and `503` | |
| Mutations: cart create and update, order create, payment create, sign-in (`POST /login`) | `429` and `503` only (the built-in codes that ts-client always adds; `retryCodes` is empty and `retryOnAbort` is off) | timeouts and `500`/`502`/`504`: the first attempt may already have been committed. Re-sending a cart update would get a `409`, and the cart code would then re-apply the same actions on the latest version (doubled quantities) |

Worst-case latency of a read that keeps timing out is about 4 x 10 s plus up to about 5.6 s of backoff (roughly 46 s); the search pipeline's own `commercetoolsMs` timeout ends the step earlier but does not cancel the request in flight. A timed-out mutation fails after 10 s. No caller abort signal reaches this client, so a caller abort is never retried.

Error objects never include the request, so a failed sign-in does not keep the password. The concurrent-modification middleware is deliberately not used: the cart code already retries a `409` once with the latest cart version.

#### Product Search availability

Product Search must be enabled on the project. Product Projection Search and Search Term Suggestions are deprecated, cannot be activated on projects created after 31 August 2026 and are deactivated after 30 days without calls. Since 3.0.0 a missing Product Search fails fast with an actionable message ("Product Search API is not enabled ..."). Projects that still have Product Projection Search can opt in to the old fallback with `CAT_LEGACY_PRODUCT_PROJECTION_SEARCH=true`, which logs a deprecation warning once per process.

### AI provider

| Variable | Default | Meaning |
|----------|---------|---------|
| `CAT_AI_PROVIDER` | `openrouter` | `openrouter` or `bedrock` |
| `OPENROUTER_API_KEY` | required with `openrouter` | OpenRouter API key |
| `OPENROUTER_MODEL`, `OPENROUTER_VISION_MODEL`, `OPENROUTER_VOICE_MODEL` | see [Default OpenRouter models](#default-openrouter-models) | Text, image and direct-audio models |
| `OPENROUTER_JSON_SCHEMA` | enabled | `false` disables OpenRouter `json_schema` and sends the JSON schema in the prompt instead |
| `AWS_REGION` | required with `bedrock` | AWS region for Bedrock (credentials come from the default AWS provider chain) |
| `BEDROCK_MODEL_ID` | `anthropic.claude-3-5-sonnet-20241022-v2:0` (legacy, set your own) | Bedrock text model, see [Bedrock (Converse)](#bedrock-converse) |
| `BEDROCK_VISION_MODEL_ID` | `BEDROCK_MODEL_ID` | Bedrock image model |

### Voice

| Variable | Default | Meaning |
|----------|---------|---------|
| `CAT_VOICE_MODE` | `openrouter-audio` with OpenRouter, `elevenlabs-stt` with Bedrock | `openrouter-audio` sends audio straight to the OpenRouter voice model. `elevenlabs-stt` transcribes with ElevenLabs first, then interprets the transcript |
| `CAT_VOICE_LLM_SUMMARY` | unset (off) | `true` lets the LLM write the spoken summary (`ttsText`), one extra LLM call per voice search. Unset or `false`: deterministic template summary. Any other value fails at startup |
| `ELEVENLABS_API_KEY` | unset | Enables ElevenLabs. Required for TTS summaries and for `elevenlabs-stt` |
| `ELEVENLABS_STT_MODEL` | `scribe_v2` | Speech-to-text model. Supported: `scribe_v2`, `scribe_v1` (deprecated upstream), `scribe_v2_medical`, `scribe_v3`. An unknown value logs a warning at startup and falls back to `scribe_v2` |
| `ELEVENLABS_TTS_MODEL` | `eleven_multilingual_v2` | Text-to-speech model |
| `ELEVENLABS_TTS_VOICE_ID` | `JBFqnCBsd6RMkjVDRZzb` | Text-to-speech voice |

### Locale, currency and search defaults

| Variable | Default | Meaning |
|----------|---------|---------|
| `CAT_CATALOG_LOCALE` | `en` | Primary catalog language |
| `CAT_DEFAULT_LOCALE` | unset | Deprecated alias for `CAT_CATALOG_LOCALE` |
| `CAT_SUPPORTED_LOCALES` | unset | Optional comma-separated allowlist of **catalog** locales clients may send (for example `en-GB,de-DE`). Other catalog locales fall back to `CAT_CATALOG_LOCALE`; `queryLocale` is not restricted. Unset: any well-formed locale |
| `CAT_DEFAULT_CURRENCY` | `EUR` | Default cart and price currency |
| `CAT_DEFAULT_COUNTRY` | unset | ISO country for cart and product-card price selection (required when prices are country-scoped, for example `DE`) |
| `CAT_DEFAULT_LIMIT` | `20` | Product cards per search when the request sends no `limit` (positive integer; requests are clamped to 1-100) |

### Cart and payments

| Variable | Default | Meaning |
|----------|---------|---------|
| `CAT_CART_SESSION_SECRET` | required (except `NODE_ENV` `development`/`test`) | HMAC secret for customer cart session tokens (24 h lifetime), mapped to `config.cartSession.secret`. Always at least 32 bytes (UTF-8 length of the trimmed value), otherwise `createCommerceAIServer` throws at startup, in every environment. A missing secret also throws unless `NODE_ENV` is exactly `development` or `test` (an unset `NODE_ENV` or `staging` throws too); only those two get a random per-process secret with a warning (sessions end on restart). The commercetools client secret is never used. Revocation hooks (`cartSession.isRevoked`, `cartSession.onLogout`) are set in code; see [Session identity](CART-AND-CHECKOUT.md#session-identity) |
| `CAT_PAYMENT_REQUIRED` | unset | `true` or `false`. Block `POST /cart/order` without a successful authorization when a payment provider is set |

### Cache

| Variable | Default | Meaning |
|----------|---------|---------|
| `CAT_CACHE_ENABLED` | off | `true` enables the in-memory response cache (per server process) |
| `CAT_CACHE_TTL_MS` | `60000` | Cache TTL in ms. A positive value also enables the cache. `0` disables it (unless `CAT_CACHE_ENABLED=true`) |
| `CAT_CACHE_MAX_ENTRIES` | `500` | Max cached entries per process. Only read when the cache is enabled |

### Facets

| Variable | Default | Meaning |
|----------|---------|---------|
| `CAT_FACETS_ENABLED` | off | `true` enables schema-driven faceted search on the server |
| `CAT_FACET_SCHEMA_TTL_MS` | `600000` | Product Types schema cache TTL |
| `CAT_FACET_INCLUDE`, `CAT_FACET_EXCLUDE` | unset | Comma-separated attribute names to restrict or hide (for example `color,size`) |
| `CAT_FACET_MAX_ATTRIBUTES` | `12` | Limit on the attribute catalog supplied to the AI |

### Shopping missions

| Variable | Default | Meaning |
|----------|---------|---------|
| `CAT_MISSIONS_ENABLED` | unset | `true` enables missions (an extra LLM call when a query looks like a list of several products, see `looksLikeShoppingList`). `false` is a hard opt-out that a request's `enableMissions: true` cannot override. Unset: the widget decides per request |
| `CAT_MISSIONS_MAX_INTENTS` | `5` | Cap on product intents per mission |
| `CAT_MISSIONS_PER_INTENT_LIMIT` | `4` | Product cards fetched per intent |
| `CAT_MISSIONS_MIN_CONFIDENCE` | `0.6` | Fall back to standard search below this confidence (0 to 1) |

### Observability

| Variable | Default | Meaning |
|----------|---------|---------|
| `CAT_DEBUG` | off | `true` enables structured console tracing for search and commercetools calls; shopper text is logged as length and hash. `NODE_ENV` has no effect |
| `CAT_DEBUG_RAW` | off | `true` (with `CAT_DEBUG=true`) logs shopper text verbatim instead of length and hash |
| `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` | unset | Both enable Langfuse tracing. [Observability](OBSERVABILITY.md) |
| `LANGFUSE_BASE_URL` | Langfuse EU cloud | Self-host or other region |
| `LANGFUSE_TRACE_SUGGESTIONS` | off | `true` also traces autocomplete spans |
| `LANGFUSE_PROMPTS` | off | `true` fetches system prompts from Langfuse at runtime |
| `LANGFUSE_PROMPT_LABEL` | `production` | Langfuse prompt label |
| `LANGFUSE_PROMPT_CACHE_TTL_SECONDS` | `60` | Client-side prompt cache TTL in seconds (`0` disables the cache) |
| `LANGFUSE_PROMPT_FETCH_TIMEOUT_MS` | `2000` | Upper bound for one prompt fetch; on timeout the local prompt is used |
| `LANGFUSE_PROMPT_MAX_RETRIES` | `0` | SDK retries of a failed prompt fetch (`0` disables retries) |

A managed prompt must contain its required safety phrases or it is rejected in favour of the local one; see [Prompt management](OBSERVABILITY.md#prompt-management) for the exact phrases per prompt.

## Faceted search

Set `enableFacets` on the widget (or `CAT_FACETS_ENABLED` on the server). The pipeline discovers filterable attributes from Product Types marked `isSearchable`. The AI proposes relevant facets; shoppers refine with chips or natural language (for example “height above 10 cm”). Hex color values are shown as the nearest CSS color name with a swatch; filters still use the original hex key. The server loads Product Types once per `CAT_FACET_SCHEMA_TTL_MS` per project, independent of locale, and caches up to 32 resolved schemas (least recently used first out) in-process. It exposes `GET /search/facet-schema` for host-app preload. Category chip selections are sent to Product Search as `postFilter`, so the categories group keeps its other buckets (other chips stay in the main query so cards keep the matching variant, unless the request carries `facetSelections`, which moves every selected chip group to `postFilter` for multi-select counts); the price facet counts only the request currency; category chips show localized category names. Details, the facet helper `currency` parameter and the version-skew note: [faceted navigation](SEARCH-PIPELINE.md#faceted-navigation-query-vs-postfilter).

## Shopping missions

Set `enableMissions` on the React or Angular widget or `CAT_MISSIONS_ENABLED=true` on the server. Config on `CommerceAIConfig.missions`: `enabled` (default unset), `maxIntents` (5), `perIntentLimit` (4), `minConfidence` (0.6). The widget sends `enableMissions: true` as a per-request override on text, voice, and image search. That override applies only while `missions.enabled` is unset or `true`. Set `missions: { enabled: false }` in `CommerceAIConfig` to turn missions off for the host: it is a hard opt-out, and a request with `enableMissions: true` cannot override it (each mission adds an LLM call per search). Results render as intent lanes: the search control stays at about 46rem. One or two intents keep the mission canvas at that same width so product cards stay compact; three or more intents grow the canvas up to 72rem and fill it. Lanes stack in a single column below about 42rem of widget width and sit side by side when 16rem columns fit. The first product in each lane is the primary card; later matches render as compact alternatives. The footer CTA adds those primary picks (not every card in the lanes). With missions on, Enter starts a fresh search when the query looks like a compound shopping list; otherwise a facet session still refines (for example “taller glasses”). Facet chips always refine. Below 36rem, voice, camera, and image actions wrap under the query field so the input and cart stay full-width.

How compound queries are split and searched: [search pipeline](SEARCH-PIPELINE.md#worked-example-compound-shopping-list). React and Angular widgets both render grouped mission lanes and batch add-to-cart.

## Rate limits and input caps

Both adapters rate-limit per client with in-memory fixed windows. Counters are per process, so multi-instance hosts should add an edge or WAF limit too (see [cart and checkout](CART-AND-CHECKOUT.md)). The low-level `createHandlers(server)` exported from `@commerce-ai-tool/server` is not an adapter: it has no per-client limiter and does not check the request `Content-Type` (415), so a host that wires it into its own framework must add both.

| Routes | Default | Option (`createExpressRouter` / `createNextHandlers` / `createNextRouteHandler`) |
|--------|---------|------------------------------------------------------|
| `POST /search`, `/search/voice`, `/search/image`, `/tts` | 30 requests / minute, one shared bucket | `aiRateLimit` |
| `POST /search/suggestions` | 120 requests / minute, separate bucket (each request can make an AI call) | `suggestionsRateLimit`; `aiRateLimit` does not change it, but `aiRateLimit: false` also disables it |
| `POST /cart/login` | 10 attempts / 15 minutes per client and 10 failed logins / 15 minutes per email | `loginRateLimit` |
| `POST /cart/order` | 20 / 15 minutes | `orderRateLimit` |
| `POST /cart/payment` | 20 / 15 minutes | `paymentRateLimit` |

Each option takes `{ windowMs?, limit? }`, or `false` when an upstream gateway already throttles the route. A limited request returns 429 `RATE_LIMITED` with `Retry-After`. A voice search with spoken results uses two AI requests (`/search/voice`, then `/tts`).

The built-in limiters (every Next.js limiter, and the per-email login limiter on both adapters) track at most 10,000 keys per bucket. When a bucket is full, a new client is still admitted and the tracked window with the lowest count (the oldest on ties) is dropped. Flooding a bucket with new keys therefore cannot lock other clients out or reset a busy client's count; at most it resets clients that had made few requests.

Client identification:

- **Express:** express-rate-limit's default key generator (`req.ip`, IPv6 masked to a /56 subnet). Behind a reverse proxy, set `app.set("trust proxy", <number of proxies>)` (see [getting started](GETTING-STARTED.md#express)). Pass `keyGenerator: (req) => string` to key on something else; keys that are IP addresses are masked to a /56 subnet.
- **Next.js:** the right-most `X-Forwarded-For` entry, then `x-real-ip`, then `"local"`. This is only safe behind a proxy that sets or appends `X-Forwarded-For`. Otherwise pass `clientKey: (req) => string` as the second argument to `createNextHandlers`. Each `createNextHandlers()` call has its own counters, so create one handlers instance in a shared module and use it from every route file (see [getting started](GETTING-STARTED.md#3-add-api-routes-nextjs)); separate instances per route multiply the limits.

Input caps (400 `VALIDATION` when exceeded):

| Field | Cap |
|-------|-----|
| Search `query`, `refineQuery`; suggestions `query` | 300 characters |
| `/tts` `text` | 500 characters |
| Search `limit` (text, voice, image) | Clamped to 1–100 (Product Search maximum); omitted uses `defaults.limit` |
| Search `searchTerms` | An array of at most 20 non-empty strings, each at most 300 characters (trimmed); anything else, including a plain string or a non-string entry, is rejected |
| Search `sort` | One of `relevance`, `price_asc`, `price_desc` |
| Search `suggestedFacets` | An array of at most 20 `{ name, reason? }` objects of strings; `name` is 1–100 characters |
| Search `facetSelections` | An object of string arrays: at most 20 groups, 20 values per group, 100-character group ids, 200-character values |

### Upload and body size limits

Limits are enforced in both adapters before the body is buffered; nothing larger than the cap is held in memory. Responses are 413 `PAYLOAD_TOO_LARGE` (over the size) and 415 `UNSUPPORTED_MEDIA_TYPE` (type not allowed).

| Input | Limit |
|-------|-------|
| JSON body (every JSON `POST` route) | 64 KB |
| `/search/image` file | 8 MiB; `image/jpeg`, `image/png`, `image/webp` |
| `/search/voice` file | 10 MiB; `audio/wav` (`audio/wave`, `audio/x-wav`), `audio/webm`, `audio/mpeg` (`audio/mp3`), `audio/mp4` (`audio/m4a`), `audio/ogg`, `audio/flac`, `audio/aac`; codec parameters such as `;codecs=opus` are ignored |
| Multipart request | One file part and at most 20 text fields (a second file is 400 `VALIDATION`), each text field at most 16 KB |

The image route accepts `multipart/form-data` only (there is no base64 JSON upload), so the 64 KB JSON cap does not apply to it. The size is checked against `Content-Length` first and then counted while the body streams, so chunked uploads without `Content-Length` are capped too. Behind a reverse proxy, also set a body size limit there (for example nginx `client_max_body_size`).

JSON `POST` routes return 415 `UNSUPPORTED_MEDIA_TYPE` unless `Content-Type` is `application/json` (parameters such as `; charset=utf-8` are allowed). This blocks cross-site `text/plain` posts, which browsers send without a CORS preflight. The voice and image routes stay `multipart/form-data`.

## Autocomplete (`searchKeywords`)

Search Term Suggestions is deprecated (see [Product Search availability](#product-search-availability)): on a project where it cannot be activated, autocomplete goes straight to the AI fallback.

Autocomplete uses commercetools Search Term Suggestions first (`searchKeywords` in `catalogLocale`, plus `queryLocale` when it differs). Keywords use a whitespace tokenizer, so `table` matches `Art Deco Coffee Table`, but `coffee table` as a prefix does not — the server retries the last token and **keeps only hits that still contain every query token**. When nothing remains for cross-locale or multi-word natural-language input, a lightweight AI call proposes catalog-language suggestion phrases.

Same-locale single-token prefixes still rely on catalog `searchKeywords`. Seed a demo catalog from product names:

```bash
# Dry-run (default) — loads apps/demo-next/.env.local when CTP_* is unset
pnpm seed:search-keywords

# Write keywords (whitespace tokenizer on product names only)
pnpm seed:search-keywords -- --apply
```

The script walks the catalog with the documented id cursor (`sort=id asc`, `withTotal=false`, `limit=100`, and `where=id > "<lastId>"` for later pages) instead of `offset`, so it covers catalogs larger than the 10000-offset cap and is not affected by products inserted while it runs.

`--force` overwrites existing keywords; `--limit N` caps how many products are processed. After changing seed logic, refresh with `pnpm seed:search-keywords -- --apply --force` so old description phrases are removed.
