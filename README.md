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
- **Autocomplete** — optional suggestions while typing (`enableAutocomplete`): commercetools Search Term Suggestions first, with AI catalog-language phrases when Suggest is empty for cross-locale or multi-word queries
- **Voice search** — ElevenLabs STT with optional TTS result summary
- **Image search** — vision AI extracts product attributes from photos
- **Glass UI** — minimalist design with light / dark / auto theme
- **Widget i18n** — override English default labels via the `messages` prop
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

See [`apps/demo-next`](./apps/demo-next) for all route handlers (search, suggestions, voice, image, TTS, health).

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
- `CAT_STORE_KEY` — reserved for future store-scoped search (not applied until store scope is enabled in core)
- `CAT_DEBUG=true` — structured console tracing for search and commercetools calls (local/dev)
- `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` — opt-in [Langfuse](https://langfuse.com) AI observability (both required)
- `LANGFUSE_BASE_URL` — Langfuse Cloud or self-hosted base URL (default `https://cloud.langfuse.com`)
- `LANGFUSE_PROMPTS=true` — opt-in runtime fetch of managed system prompts (local catalog remains fallback)
- `LANGFUSE_PROMPT_LABEL` — Langfuse prompt label (default `production`)
- `LANGFUSE_PROMPT_CACHE_TTL_SECONDS` — client prompt cache TTL (default `60`)
- `CAT_CACHE_ENABLED=true` — opt-in in-memory response cache (per server process)
- `CAT_CACHE_TTL_MS=60000` — cache TTL in milliseconds
- `CAT_CACHE_MAX_ENTRIES=500` — max cached entries per process
- `CAT_FACETS_ENABLED=true` — enable schema-driven faceted search on the server
- `CAT_FACET_SCHEMA_TTL_MS=600000` — Product Types schema cache TTL
- `CAT_FACET_INCLUDE=color,size` / `CAT_FACET_EXCLUDE=internalCode` — restrict discovered attributes
- `CAT_FACET_MAX_ATTRIBUTES=12` — limit the attribute catalog supplied to the AI

Autocomplete uses commercetools Search Term Suggestions first (indexed `searchKeywords` in `catalogLocale`, plus `queryLocale` when it differs). When Suggest returns nothing for cross-locale or multi-word natural-language input, the server falls back to a lightweight AI call that proposes short **catalog-language** search phrases as suggestions. Set `CAT_CATALOG_LOCALE` to a real project language (for example `en-GB` or `en-US` — not bare `en` unless that locale exists on products).

Same-locale single-token prefixes still rely on catalog `searchKeywords` (seed with `pnpm seed:search-keywords` for demos).

To backfill keywords for a demo catalog from product name/description:

```bash
# Dry-run (default) — loads apps/demo-next/.env.local when CTP_* is unset
pnpm seed:search-keywords

# Write keywords (whitespace tokenizer on name + short description phrases)
pnpm seed:search-keywords -- --apply
```

Options: `--force` overwrites existing keywords; `--limit N` caps how many products are processed.

Search queries are built in `@commerce-ai-tool/core` (`commercetools/query-builder.ts`): multi-field full-text (`name`, `searchKeywords`, `description`), optional fuzzy name matching, AI `filters` (color, brand, category, price range), and currency-scoped price sorting. Product Projection Search is used automatically when Product Search API is unavailable.

### Langfuse (AI observability)

Opt-in production tracing for text / voice / image search and TTS: AI generations, commercetools search, and ElevenLabs STT/TTS nest under one OpenTelemetry request span exported to [Langfuse](https://langfuse.com).

- Set `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` (and optionally `LANGFUSE_BASE_URL` for self-host or non-EU regions). Without both keys, tracing is a no-op.
- Host apps must register a `LangfuseSpanProcessor` once (see `apps/demo-next/src/instrumentation.node.ts`) and may call `registerLangfuseFlush` from `@commerce-ai-tool/server/flush` (or set the shared `globalThis` flush key) for serverless flush.
- Autocomplete (`/search/suggestions`) is **not** traced by default (high keystroke volume). CT-only hits stay off the request span; when the AI fallback runs, `suggestSearchTerms` still emits a generation via the wrapped AI provider. Set `LANGFUSE_TRACE_SUGGESTIONS=true` to also trace the Suggest request span.
- `CAT_DEBUG` remains console-only local tracing; Langfuse is the searchable production path. When Langfuse is enabled or `CAT_DEBUG=true`, responses may include `meta.traceId` for local linking (non-stable client contract).
- Binary image/audio payloads are redacted from traces (mime type, byte length, hash only). Voice **transcripts** may still contain personal speech content — configure Langfuse retention accordingly.

#### Prompt management

System prompts live in git under `packages/core/src/prompts` (source of truth for Vitest and Promptfoo). Optionally push them to Langfuse and fetch by label at runtime:

1. Sync catalog → Langfuse staging: `pnpm sync:langfuse-prompts` (or `-- --dry-run`). Promote with `pnpm sync:langfuse-prompts -- --label production` only after Promptfoo passes.
2. Enable runtime fetch with `LANGFUSE_PROMPTS=true` (same API keys), or set `langfuse.promptsEnabled` on `CommerceAIConfig` (applied when creating the search orchestrator). Missing or failed fetches fall back to the local catalog; failures are logged when `CAT_DEBUG=true` / non-production. Promptfoo evals call `configureLangfusePrompts({ promptsEnabled: false })` so they always use the git catalog.
3. Optional: `LANGFUSE_PROMPT_LABEL` (default `production`) and `LANGFUSE_PROMPT_CACHE_TTL_SECONDS` (default `60`), or the matching `CommerceAIConfig.langfuse` fields.
4. Generations link to the Langfuse prompt version when managed text is used (not on local fallback).

User-message builders and JSON parsers stay in code — only system prompt text is managed remotely.

### Faceted search

Set `enableFacets` on the widget to let the search pipeline discover filterable attributes from commercetools Product Types. Only attributes marked `isSearchable` are considered. The AI proposes relevant facets for the initial query; users can refine with facet chips or natural language, such as “height above 10 cm”. The server keeps the schema in a short-lived process cache and exposes `GET /search/facet-schema` for host-app preload.

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
      enableAutocomplete
      enableFacets
      enableVoice
      enableImageSearch
      enableCameraSearch
      enableTts
      messages={{
        placeholder: "What are you looking for?",
        searching: "Searching...",
      }}
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
import { loadConfigFromEnv } from "@commerce-ai-tool/server";
import { createExpressRouter } from "@commerce-ai-tool/server/express";

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
