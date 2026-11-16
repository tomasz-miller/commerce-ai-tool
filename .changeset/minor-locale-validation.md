---
"@commerce-ai-tool/server": minor
"@commerce-ai-tool/core": minor
---

Client locales are validated at the HTTP boundary. `queryLocale`, `catalogLocale` and `locale` on search, voice, image, suggestions, cart, checkout, payment and order routes must be canonical BCP 47 tags (`Intl.getCanonicalLocales`); invalid values (for example `en_GB`) are replaced by the configured default instead of reaching prompts, commercetools requests or `Intl.NumberFormat`. New optional `CAT_SUPPORTED_LOCALES` (comma-separated; `CommerceAIConfig.supportedLocales`) restricts clients to an allowlist, matched case-insensitively. An invalid locale can no longer turn a completed order or payment into a 500: price formatting falls back to `en` on a `RangeError`.

`FacetSchemaStore` (in `@commerce-ai-tool/core/internal`) is bounded: constructor `(ttlMs = 600_000, maxEntries = 32)`. Product Types are loaded once per TTL per project regardless of locale, resolved schemas live in an LRU of `maxEntries`, and expired entries are dropped on read.
