---
"@commerce-ai-tool/core": minor
"@commerce-ai-tool/server": minor
---

The HTTP wire contract is typed in one place. `@commerce-ai-tool/core` and `@commerce-ai-tool/core/client` export `SearchRequestBody`, `SuggestionsRequestBody`, `ImageSearchRequest`, `VoiceSearchRequest` (multipart fields, all strings), `TtsRequestBody` and `VoiceSearchResponse`, next to the existing `ApiErrorBody` and `ApiErrorCode`. The server handlers parse into these types, and `executeSearch`, `executeFacetSchema`, `executeSearchSuggestions` and `executeSearchImage` return `SearchResult`, `ResolvedFacetSchema`, `SuggestionsResult` and `ImageSearchResult` instead of `unknown`. `@commerce-ai-tool/server` re-exports the types, including `ApiErrorCode`. `SearchRequestBody` and `TextSearchRequest` gain an optional `facetSelections` field (see the facet navigation docs).
