# @commerce-ai-tool/core

Framework-agnostic search logic, AI adapters, and the commercetools client for [Commerce AI Tool](https://github.com/tomasz-miller/commerce-ai-tool).

Host storefronts should not install this package in the browser app. Install `@commerce-ai-tool/server` on the backend; it depends on `core`. The React and Angular widgets bundle a small client-safe surface and do not declare `core` as a runtime dependency.

```bash
pnpm add @commerce-ai-tool/server
```

Setup: [Getting started](https://github.com/tomasz-miller/commerce-ai-tool/blob/main/docs/GETTING-STARTED.md).
