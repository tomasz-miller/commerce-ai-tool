# @commerce-ai-tool/angular

Standalone Angular product search widget. Talks only to the host `/api/commerce-ai/*` routes — API keys never reach the browser.

```bash
pnpm add @commerce-ai-tool/angular @commerce-ai-tool/server
```

```ts
import { CommerceAiSearchComponent } from "@commerce-ai-tool/angular";
```

```css
/* src/styles.css */
@import "@commerce-ai-tool/angular/styles.css";
```

Requires Angular `^20.3.0 || ^21.0.0 || ^22.0.0`. Published in the Angular Package Format (partial Ivy compilation, ESM only).

The demo app in the GitHub repository is not an npm dependency.

Setup: [Getting started](https://github.com/tomasz-miller/commerce-ai-tool/blob/main/docs/GETTING-STARTED.md).
