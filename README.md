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
      locale="en"
      enableVoice
      enableImageSearch
      enableTts
      onProductSelect={(product) => console.log(product)}
    />
  );
}
```

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

## License

MIT
