# Configuration

Locales, models, and environment variables. Host apps load secrets with `loadConfigFromEnv()` on the server.

[Documentation index](README.md) · [Getting started](getting-started.md) · [Search pipeline](search-pipeline.md)

## Locales

| Field | Purpose | Source |
|-------|---------|--------|
| `catalogLocale` | Language products are indexed in commercetools (`fullText.language`, card names) | `CAT_CATALOG_LOCALE`, widget `catalogLocale` prop |
| `queryLocale` | Language the shopper types or speaks (AI input, `interpretation`, TTS) | Widget `queryLocale` / request body; defaults to `catalogLocale` |

The AI translates `searchTerms` into the catalog language. Product names in results use `catalogLocale`.

Set `CAT_CATALOG_LOCALE` to a locale that exists on products (for example `en-GB` or `en-US` — not bare `en` unless that locale is on the catalog).

`CAT_DEFAULT_LOCALE` is a deprecated alias for `CAT_CATALOG_LOCALE`.

Resolver: `packages/core/src/locale/resolve.ts`. Pipeline details: [search pipeline](search-pipeline.md).

## Default OpenRouter models

Override with env:

| Variable | Default | Role |
|----------|---------|------|
| `OPENROUTER_MODEL` | `openai/gpt-5.6-luna` | Text interpretation |
| `OPENROUTER_VISION_MODEL` | `google/gemini-3.7-flash` | Image search |
| `OPENROUTER_VOICE_MODEL` | `google/gemini-3.7-flash` | Direct audio interpretation |

## Voice search TTS

Spoken summaries are **voice-search only** (text and image search stay visual).

- Auto-play and replay appear only after a voice search
- Summary language follows `queryLocale`
- Product names in the spoken summary are translated to `queryLocale` when they differ from the catalog language
- Set `queryLocale` on the widget (or `NEXT_PUBLIC_CAT_QUERY_LOCALE` in the demo) to match the language you speak

## Environment variables

See [`apps/demo-next/.env.example`](../apps/demo-next/.env.example) for the copy-paste template.

| Variable | Role |
|----------|------|
| `CTP_PROJECT_KEY`, `CTP_CLIENT_ID`, `CTP_CLIENT_SECRET`, `CTP_REGION` | commercetools API |
| `CAT_AI_PROVIDER` | `openrouter` or `bedrock` |
| `OPENROUTER_API_KEY` | OpenRouter (when using that provider) |
| `ELEVENLABS_API_KEY` | Voice STT / TTS |
| `CAT_CATALOG_LOCALE` | Primary catalog language |
| `CAT_DEFAULT_CURRENCY` | Default cart and price currency (e.g. `EUR`) |
| `CAT_DEFAULT_COUNTRY` | ISO country for cart and product-card price selection (required when prices are country-scoped, e.g. `DE`) |
| `CAT_CART_SESSION_SECRET` | HMAC secret for customer cart session tokens (optional; falls back to `CTP_CLIENT_SECRET`. Use a dedicated secret in production) |
| `CAT_STORE_KEY` | Reserved for future store-scoped search (not applied until store scope is enabled in core) |
| `CAT_DEBUG=true` | Structured console tracing for search and commercetools calls |
| `LANGFUSE_*` | Opt-in AI observability — [observability](observability.md) |
| `CAT_CACHE_ENABLED=true` | In-memory response cache (per server process) |
| `CAT_CACHE_TTL_MS` | Cache TTL (default `60000`) |
| `CAT_CACHE_MAX_ENTRIES` | Max cached entries per process (default `500`) |
| `CAT_FACETS_ENABLED=true` | Schema-driven faceted search on the server |
| `CAT_FACET_SCHEMA_TTL_MS` | Product Types schema cache TTL (default `600000`) |
| `CAT_FACET_INCLUDE` / `CAT_FACET_EXCLUDE` | Restrict discovered attributes (e.g. `color,size`) |
| `CAT_FACET_MAX_ATTRIBUTES` | Limit the attribute catalog supplied to the AI (default `12`) |
| `CAT_MISSIONS_ENABLED=true` | Multi-item shopping missions (extra LLM call per fresh text search) |
| `CAT_MISSIONS_MAX_INTENTS` | Cap on product intents per mission (default `5`) |
| `CAT_MISSIONS_PER_INTENT_LIMIT` | Product cards fetched per intent (default `4`) |
| `CAT_MISSIONS_MIN_CONFIDENCE` | Fall back to standard search below this confidence (default `0.6`) |
| `CAT_PAYMENT_REQUIRED` | Block `POST /cart/order` without a successful authorization when a payment provider is set |

## Faceted search

Set `enableFacets` on the widget (or `CAT_FACETS_ENABLED` on the server). The pipeline discovers filterable attributes from Product Types marked `isSearchable`. The AI proposes relevant facets; shoppers refine with chips or natural language (for example “height above 10 cm”). Hex color values are shown as the nearest CSS color name with a swatch; filters still use the original hex key. The server caches the schema in-process and exposes `GET /search/facet-schema` for host-app preload.

## Shopping missions

Set `enableMissions` on the React widget or `CAT_MISSIONS_ENABLED=true` on the server. Config on `CommerceAIConfig.missions`: `enabled` (default `false`), `maxIntents` (5), `perIntentLimit` (4), `minConfidence` (0.6). The widget sends `enableMissions: true` as a per-request override.

How compound queries are split and searched: [search pipeline](search-pipeline.md#worked-example-compound-shopping-list). Angular and voice/image missions are not in this release.

## Autocomplete (`searchKeywords`)

Autocomplete uses commercetools Search Term Suggestions first (`searchKeywords` in `catalogLocale`, plus `queryLocale` when it differs). Keywords use a whitespace tokenizer, so `table` matches `Art Deco Coffee Table`, but `coffee table` as a prefix does not — the server retries the last token and **keeps only hits that still contain every query token**. When nothing remains for cross-locale or multi-word natural-language input, a lightweight AI call proposes catalog-language suggestion phrases.

Same-locale single-token prefixes still rely on catalog `searchKeywords`. Seed a demo catalog from product names:

```bash
# Dry-run (default) — loads apps/demo-next/.env.local when CTP_* is unset
pnpm seed:search-keywords

# Write keywords (whitespace tokenizer on product names only)
pnpm seed:search-keywords -- --apply
```

`--force` overwrites existing keywords; `--limit N` caps how many products are processed. After changing seed logic, refresh with `pnpm seed:search-keywords -- --apply --force` so old description phrases are removed.
