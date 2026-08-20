---
"@commerce-ai-tool/core": minor
---

Add v1.4 GraphQL product-card hydrate: after Product Search returns IDs, fetch name/image/price/sku via platform-sdk `graphql()` with REST `productProjections().get()` fallback; pass `defaults.country` into price selection.
