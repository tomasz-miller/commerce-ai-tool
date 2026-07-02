# Commerce AI Tool

AI-powered product search plugin for [commercetools](https://commercetools.com) composable commerce projects. Supports React, Next.js, and Angular with voice, text, and image search.

## Packages

| Package | Description |
|---------|-------------|
| [`@commerce-ai-tool/core`](./packages/core) | Framework-agnostic search logic, AI adapters, commercetools client |
| [`@commerce-ai-tool/server`](./packages/server) | Server-side API handlers (Next.js App Router, Express) |
| [`@commerce-ai-tool/react`](./packages/react) | Glass morphism search widget for React / Next.js |
| [`@commerce-ai-tool/angular`](./packages/angular) | Standalone Angular search component |

## Features (v1.0)

- **Text search** — natural language queries interpreted by AI (OpenRouter or AWS Bedrock)
- **Voice search** — ElevenLabs STT with optional TTS result summary
- **Image search** — vision AI extracts product attributes from photos
- **Glass UI** — minimalist design with light / dark / auto theme
- **Server-only secrets** — API keys never exposed to the browser

## Quick start (Next.js)

### 1. Install packages

```bash
pnpm add @commerce-ai-tool/react @commerce-ai-tool/server
```

### 2. Configure environment variables

Copy [`.env.example`](./apps/demo-next/.env.example) and set your credentials:

```env
CTP_PROJECT_KEY=your-project-key
CTP_CLIENT_ID=your-client-id
CTP_CLIENT_SECRET=your-client-secret
CTP_REGION=europe-west1.gcp
CAT_AI_PROVIDER=openrouter
OPENROUTER_API_KEY=your-key
ELEVENLABS_API_KEY=your-key
```

> **Note:** Enable [Product Search](https://docs.commercetools.com/api/projects/product-search) on your commercetools project before use.

### 3. Add API routes

```typescript
// app/api/commerce-ai/search/route.ts
import { createNextHandlers, loadConfigFromEnv } from "@commerce-ai-tool/server";

const handlers = createNextHandlers(loadConfigFromEnv());
export const POST = handlers.search;
```

See [`apps/demo-next`](./apps/demo-next) for all route handlers (voice, image, TTS, health).

### Locale configuration

Search uses two locale concepts:

| Field | Purpose | Source |
|-------|---------|--------|
| `catalogLocale` | Language products are indexed in commercetools | `CAT_CATALOG_LOCALE` env, widget `catalogLocale` prop |
| `queryLocale` | Language the user types or speaks in (AI input) | Widget `queryLocale` prop / request body; defaults to `catalogLocale` |

The AI translates `searchTerms` into the catalog language before querying commercetools. Product names in results use `catalogLocale`.

### Voice search TTS

Spoken result summaries are **voice-search only** (text and image search show visual results without TTS).

- Auto-play and the replay button appear only after a voice search
- Summary language follows `queryLocale` (e.g. `pl` → Polish, `en` → English)
- Product names in the spoken summary are translated to `queryLocale` when they differ from the catalog language
- Set `queryLocale` on the widget (or `NEXT_PUBLIC_CAT_QUERY_LOCALE` in the demo) to match the language you speak

Server env vars (see `apps/demo-next/.env.example`):

- `CAT_CATALOG_LOCALE` — primary catalog language (e.g. `no` for Norwegian shops)
- `CAT_DEFAULT_LOCALE` — deprecated alias for `CAT_CATALOG_LOCALE`
- `CAT_DEBUG=true` — structured dev tracing for search and commercetools calls

### 4. Add the widget

```tsx
"use client";

import { CommerceAISearch } from "@commerce-ai-tool/react";
import "@commerce-ai-tool/react/styles.css";

export function Search() {
  return (
    <CommerceAISearch
      apiBaseUrl="/api/commerce-ai"
      theme="auto"
      catalogLocale="no"
      queryLocale="en"
      enableVoice
      enableImageSearch
      enableCameraSearch
      enableTts
      onProductSelect={(product) => console.log(product)}
    />
  );
}
```

Image search supports file upload, drag-and-drop, and camera capture (`enableCameraSearch`, default `true`). On mobile, the camera button opens the native camera; on desktop, it shows an in-widget preview. Use `cameraFacingMode` (`"environment"` rear or `"user"` front) when needed.

## Angular

```typescript
import { CommerceAiSearchComponent } from "@commerce-ai-tool/angular";
import "@commerce-ai-tool/angular/styles.css";

@Component({
  imports: [CommerceAiSearchComponent],
  template: `
    <commerce-ai-search
      apiBaseUrl="/api/commerce-ai"
      theme="auto"
      (productSelect)="onSelect($event)"
    />
  `,
})
export class AppComponent {}
```

## Express

```typescript
import express from "express";
import { createExpressRouter, loadConfigFromEnv } from "@commerce-ai-tool/server";

const app = express();
app.use(createExpressRouter({ config: loadConfigFromEnv(), basePath: "/api/commerce-ai" }));
app.listen(3001);
```

## Development

```bash
pnpm install
pnpm build
pnpm dev   # starts demo-next on http://localhost:3000
```

## Architecture

```
Browser Widget  →  Your API (server package)  →  AI + ElevenLabs + commercetools
```

All third-party API keys stay on the server. The UI only calls your `/api/commerce-ai/*` endpoints.

## Roadmap

See [ROADMAP.md](./ROADMAP.md).

## Publishing to npm

Packages are versioned with [Changesets](https://github.com/changesets/changesets). To publish:

1. Create an npm organization `commerce-ai-tool` (or update scope in `package.json`)
2. Log in: `npm login`
3. Add `NPM_TOKEN` to GitHub repository secrets for CI releases
4. Run locally:

```bash
pnpm changeset          # describe changes (optional after initial release)
pnpm version-packages   # bump versions from changesets
pnpm release            # build + publish all packages
```

Current release workflow (`.github/workflows/release.yml`) publishes automatically on merge to `main` when changesets are present.

## License

MIT
