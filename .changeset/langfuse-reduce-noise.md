---
"@commerce-ai-tool/core": patch
"@commerce-ai-tool/server": patch
---

Reduce Langfuse noise: skip autocomplete suggestion spans by default and drop the redundant search.pipeline layer so AI and commercetools nest under the HTTP request span.
