---
"@commerce-ai-tool/core": minor
"@commerce-ai-tool/server": minor
---

New optional `facetSelections` field on the search request (`SearchRequestBody`, `TextSearchRequest`): facet group id to the selected bucket keys. When present, every listed chip group goes to Product Search `postFilter` (counts of the group stay visible for multi-select) and its keys are not treated as model constraints; filters of unlisted groups stay in `query`. Without it, behaviour is unchanged (only the `categories` group goes to `postFilter`). Because commercetools computes matching variants from `query`, a variant-level chip sent through `facetSelections` no longer narrows the matched variant, so a card may show the master variant. The server rejects a malformed or oversized value (more than 20 groups, 20 values per group, 100-character ids, 200-character values) with 400 `VALIDATION`. `ProductSearchBuildInput` gains `postFilterAllGroups`. Both bundled widgets send it for the chips the shopper clicked.
