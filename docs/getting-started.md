# Getting started

Add Commerce AI search to a host app. Secrets stay on the server; the widget calls only your `/api/commerce-ai/*` routes.

[Documentation index](README.md) · [Configuration](configuration.md)

## 1. Install packages

```bash
pnpm add @commerce-ai-tool/react @commerce-ai-tool/server
```

Use `@commerce-ai-tool/angular` instead of (or in addition to) the React widget when the host is Angular.

## 2. Configure credentials

Copy [`apps/demo-next/.env.example`](../apps/demo-next/.env.example) and set:

```env
CTP_PROJECT_KEY=your-project-key
CTP_CLIENT_ID=your-client-id
CTP_CLIENT_SECRET=your-client-secret
CTP_REGION=europe-west1.gcp
CAT_AI_PROVIDER=openrouter
OPENROUTER_API_KEY=your-key
ELEVENLABS_API_KEY=your-key
```

Enable [Product Search](https://docs.commercetools.com/api/projects/product-search) on the commercetools project before use.

## 3. Add API routes (Next.js)

```typescript
// app/api/commerce-ai/search/route.ts
import { createNextHandlers, loadConfigFromEnv } from "@commerce-ai-tool/server";

const handlers = createNextHandlers(loadConfigFromEnv());
export const POST = handlers.search;
```

See [`apps/demo-next`](../apps/demo-next) for all route handlers (search, suggestions, voice, image, TTS, cart, health).

### Express

```typescript
import express from "express";
import { loadConfigFromEnv } from "@commerce-ai-tool/server";
import { createExpressRouter } from "@commerce-ai-tool/server/express";

const app = express();
app.use(createExpressRouter({ config: loadConfigFromEnv(), basePath: "/api/commerce-ai" }));
app.listen(3001);
```

## 4. Add the widget (React)

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
      enableAutocomplete
      enableFacets
      enableVoice
      enableImageSearch
      enableCameraSearch
      enableTts
      enableCart
      enableMissions
      messages={{
        placeholder: "What are you looking for?",
        searching: "Searching...",
      }}
      onProductSelect={(product) => console.log(product)}
      onCartChange={(cart) => console.log(cart)}
    />
  );
}
```

Override English default labels with the `messages` prop.

### Angular

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

## Search modalities

Voice, camera, and uploaded-image search are independently configurable in React and Angular. All three are enabled by default; disable the controls the host does not need.

| Prop | Role |
|------|------|
| `enableVoice` | Microphone search |
| `enableCameraSearch` | Camera capture (native camera on mobile; in-widget preview on desktop) |
| `enableImageSearch` | File upload and drag-and-drop |
| `enableTts` | Spoken result summary after **voice** search only; does not enable the microphone |

```tsx
<CommerceAISearch
  apiBaseUrl="/api/commerce-ai"
  enableVoice
  enableCameraSearch={false}
  enableImageSearch={false}
/>
```

```html
<commerce-ai-search
  apiBaseUrl="/api/commerce-ai"
  [enableVoice]="false"
  [enableCameraSearch]="true"
  [enableImageSearch]="false"
/>
```

Use `cameraFacingMode` (`"environment"` rear or `"user"` front) when needed. These flags control widget UI only; they do not remove or secure host API routes.

How a query is interpreted and sent to commercetools: [search pipeline](search-pipeline.md). Facets, missions, and cart flags are documented there and in [cart and checkout](cart-and-checkout.md).
