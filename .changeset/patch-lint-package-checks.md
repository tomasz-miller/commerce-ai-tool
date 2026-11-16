---
"@commerce-ai-tool/core": patch
"@commerce-ai-tool/server": patch
"@commerce-ai-tool/react": patch
"@commerce-ai-tool/angular": patch
---

Packaging fixes found by the new `attw` and `publint` checks. `ProductSearchQueryBody` is no longer exported from the browser-safe `@commerce-ai-tool/core/client` entry (it stays exported, deprecated, from the server-side `@commerce-ai-tool/core` index), so the vendored core client types in the React and Angular packages no longer reference `@commercetools/platform-sdk`. `@commerce-ai-tool/core` and `@commerce-ai-tool/server` now declare `typesVersions` so TypeScript consumers using `moduleResolution: node10` can resolve the `/client`, `/next`, `/express` and `/flush` subpath entries.
