# @commerce-ai-tool/core

## 2.4.0

### Initial public release

First published version of the Commerce AI Tool plugin (product roadmap through v2.4).

- AI-powered commercetools Product Search (OpenRouter or AWS Bedrock) with voice, text, and image input
- Autocomplete via Search Term Suggestions, AI suggestion fallback, and AI-suggested facets
- Optional `primaryTerm` boosting, multi-keyword OR search, and empty-result retries (drop soft filters, then match the primary phrase)
- Product-card hydrate via GraphQL after ID-only Product Search
- Anonymous and authenticated carts, host-routed checkout, payment provider hooks, and order confirmation
- Multi-item shopping missions (compound queries split into parallel Product Search calls)
- Opt-in Langfuse observability
- Browser-safe `@commerce-ai-tool/core/client` export for widgets (types, messages, facet helpers). Do not install `core` in a frontend-only app; `@commerce-ai-tool/server` pulls the full package on the backend.
