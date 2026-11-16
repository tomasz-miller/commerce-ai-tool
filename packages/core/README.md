# @commerce-ai-tool/core

Framework-agnostic search logic, AI adapters, and the commercetools client for [Commerce AI Tool](https://github.com/tomasz-miller/commerce-ai-tool).

Host storefronts should not install this package in the browser app. Install `@commerce-ai-tool/server` on the backend; it depends on `core`. The React widget bundles the browser-safe `@commerce-ai-tool/core/client` entry and does not depend on `core` at runtime. The Angular package depends on `core` (a regular dependency) and imports only `@commerce-ai-tool/core/client`.

```bash
pnpm add @commerce-ai-tool/server
```

Entries:

- `@commerce-ai-tool/core`: the public, semver-covered API (config and wire types, the `AIProvider`, `PaymentProvider`, `CommercetoolsClient` and `SearchOrchestrator` contracts, factories, error classes, documented constants).
- `@commerce-ai-tool/core/client`: the browser-safe surface the React and Angular widgets use.
- `@commerce-ai-tool/core/internal`: implementation helpers shared with the sibling packages. **No semver guarantee**; do not depend on it from a host. See [Migrating to 3.0.0](https://github.com/tomasz-miller/commerce-ai-tool/blob/main/docs/MIGRATION-3.0.md#13-internal-helpers-moved-to-commerce-ai-toolcoreinternal).

Setup: [Getting started](https://github.com/tomasz-miller/commerce-ai-tool/blob/main/docs/GETTING-STARTED.md).
