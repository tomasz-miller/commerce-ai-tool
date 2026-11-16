# Getting started

Add Commerce AI search to a host app. Secrets stay on the server; the widget calls only your `/api/commerce-ai/*` routes.

[Documentation index](README.md) · [Configuration](CONFIGURATION.md)

## 1. Install packages

Install only the plugin pieces your host uses. The GitHub demo apps (`apps/demo-next`, `apps/demo-angular`) are not npm packages.

```bash
# React / Next.js host
pnpm add @commerce-ai-tool/react @commerce-ai-tool/server

# Angular host
pnpm add @commerce-ai-tool/angular @commerce-ai-tool/server
```

`@commerce-ai-tool/server` pulls `@commerce-ai-tool/core` (AI + commercetools SDKs) on the backend. Do not add `core` to a frontend-only app yourself. The React widget bundles a small client-safe surface and does not depend on it at runtime. The Angular package declares `@commerce-ai-tool/core` as a regular dependency (the Angular Package Format does not bundle dependencies) and imports only its browser-safe `@commerce-ai-tool/core/client` entry, so the package manager installs `core` next to it; only that entry ends up in your bundle.

**React versions.** `@commerce-ai-tool/react` requires React 19 (`react` and `react-dom` `>=19`, new in 3.0.0). `CommerceAICheckout` runs its address, shipping and payment steps inside an async `startTransition`, which keeps `isPending` true across the awaits only in React 19; the tests run on React 19 only. Hosts on React 18 must upgrade React or stay on `@commerce-ai-tool/react` 2.x.

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

Create the handler once in a shared module and serve every route from one catch-all file. The module is evaluated once per server process, so the rate-limit counters (kept inside the handler instance) are shared by all routes:

```typescript
// lib/commerce-ai.ts
import { createNextRouteHandler, loadConfigFromEnv } from "@commerce-ai-tool/server";
import { after } from "next/server";

// Create it here, once, and nowhere else. `config` is a function so that importing the route
// file during `next build` does not need the environment variables; it runs on the first request.
export const commerceAI = createNextRouteHandler(() => loadConfigFromEnv(), {
  // Run the Langfuse flush after the response is sent.
  defer: after,
});
```

```typescript
// app/api/commerce-ai/[...path]/route.ts
import { commerceAI } from "@/lib/commerce-ai";

// Only if your platform's default function timeout is shorter than your slowest voice or image
// search. Applies to every route in this file.
// export const maxDuration = 60;

export const GET = commerceAI.GET;
export const POST = commerceAI.POST;
```

That one file serves `health`, `search` (text, `suggestions`, `facet-schema`, `voice`, `image`), `tts`, `cart` (including `add`, `add-items`, `remove`, `update-quantity`, `addresses`, `shipping-methods`, `shipping-method`, `payment-methods`, `payment`, `order`, `login`, `logout`) and `orders`, under the path it is mounted at (`/api/commerce-ai/...`). Next.js passes the matched path segments in `params`, a Promise since Next.js 15 (`ctx.params: Promise<{ path: string[] }>`). The handler dispatches through the same route table as the Express router, so limits, `Content-Type` checks, upload caps and error bodies are identical. An unknown path, or a known path with the wrong method, returns `404` with the standard error body (`code: "NOT_FOUND"`). The Express router leaves such requests unmatched, so a host app answers 404 itself. Paths are case-sensitive, and `HEAD` is answered by the matching `GET` route.

`maxDuration` is the Next.js [route segment config](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config/maxDuration) (seconds). Leave it out unless your platform's default timeout cuts off long voice or image requests.

The rate-limit counters live in the `createNextRouteHandler()` result. Calling it in every route file, or per request, gives each file its own buckets and multiplies the limits (for example, a separate 30/minute for `/search` and for `/tts` instead of one shared 30/minute). A voice search with spoken results uses two requests from the AI bucket: `/search/voice` and then `/tts`.

The default client key is the right-most `X-Forwarded-For` entry, which is only safe behind a proxy that sets that header. Otherwise pass a `clientKey` derived from a header your platform controls:

```typescript
export const commerceAI = createNextRouteHandler(() => loadConfigFromEnv(), {
  // A header your proxy or platform sets and clients cannot forge.
  clientKey: (req) => req.headers.get("x-client-ip-from-your-proxy") ?? "local",
});
```

### Optional: one file per route

`createNextHandlers(config, options)` returns one function per route, for hosts that prefer a `route.ts` per endpoint or need a route-specific export such as `maxDuration`. It uses the same route table and options. A more specific route file takes precedence over the catch-all for its own path. Keep one `createNextHandlers()` instance per process (a lazy singleton in a shared module), and do not serve rate-limited routes from both it and a catch-all: each instance has its own buckets.

```typescript
// lib/commerce-ai.ts
import { createNextHandlers, loadConfigFromEnv, type NextHandlers } from "@commerce-ai-tool/server";

let handlers: NextHandlers | null = null;

export function getCommerceAIHandlers(): NextHandlers {
  handlers ??= createNextHandlers(loadConfigFromEnv());
  return handlers;
}
```

```typescript
// app/api/commerce-ai/search/route.ts
import { getCommerceAIHandlers } from "@/lib/commerce-ai";

// Only if the platform default is too short for this route (voice and image searches):
// export const maxDuration = 60;
export const POST = (req: Request) => getCommerceAIHandlers().search(req);
```

See [`apps/demo-next`](../apps/demo-next) for a working setup: the catch-all in `src/app/api/commerce-ai/[...path]/route.ts` and one per-route example in `health/route.ts`.

### Express

```typescript
import express from "express";
import { loadConfigFromEnv } from "@commerce-ai-tool/server";
import { createExpressRouter } from "@commerce-ai-tool/server/express";

const app = express();
// Behind a reverse proxy or load balancer: the number of proxies in front of this app.
app.set("trust proxy", 1);
app.use(createExpressRouter({ config: loadConfigFromEnv(), basePath: "/api/commerce-ai" }));
app.listen(3001);
```

The same applies to `mountCommerceAIRoutes(app, options)`. The router rate-limits by `req.ip`, so behind a proxy set `app.set("trust proxy", n)` to the number of proxies between the client and the app. Without it every request appears to come from the proxy and the limits become global (express-rate-limit logs `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` when it sees `X-Forwarded-For` without `trust proxy`). Never set `trust proxy` to `true`: that trusts a client-supplied `X-Forwarded-For`. Pass `keyGenerator` to key the limiters on something else. Limits and caps: [configuration](CONFIGURATION.md#rate-limits-and-input-caps).

A runnable Express host ships with the repo: [`apps/demo-angular`](../apps/demo-angular) pairs this router with an Angular dev proxy so the widget keeps `apiBaseUrl="/api/commerce-ai"`:

```json
// apps/demo-angular/proxy.conf.json
{
  "/api/commerce-ai": {
    "target": "http://localhost:3002",
    "secure": false,
    "changeOrigin": true
  }
}
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

Everything a screen reader hears or a shopper reads on an error comes from `messages`: error text is never the server's or the browser's text (`messageForError` from `@commerce-ai-tool/core/client` maps the API error code and the `getUserMedia` exception name to a message key). Product-specific accessible names are templates with a `{name}` placeholder: `addToCartNamed` ("Add {name} to cart"), `removeItemNamed` ("Remove {name} from cart") and `quantityFor` ("Quantity of {name}", the name of the quantity group of a cart line). All three are optional. When you translated `addToCart` or `removeItem` but not their `Named` key, the widget builds `"<your text>: <product name>"` from your own wording; `quantityFor` has no such source, so add it when you localize.

The voice button is named after its action ("Voice search", then "Stop recording") and does not also set `aria-pressed`: a toggle button keeps one name, so a label that changes must not be combined with a pressed state.

`CommerceAICheckout` and `CommerceAIOrderStatus` render a `<section>` (not a `<main>`) by default, so they sit inside your page's own `<main>`. Pass `as="main"` when the widget is the whole page, `headingLevel` to fit the title under your headings, and `renderLink` to navigate with your router; see [CART-AND-CHECKOUT.md](CART-AND-CHECKOUT.md#landmarks-headings-and-links-in-commerceaicheckout-and-commerceaiorderstatus).

### Angular

Supported Angular versions: `^20.3.0 || ^21.0.0 || ^22.0.0` (peer dependencies `@angular/core`, `@angular/common`, `@angular/forms`, plus `rxjs` 7). The package is published in the Angular Package Format with partial Ivy compilation, so your Angular CLI build links it against your own Angular version; the version must be at least the 20.3 line the library is compiled on. Add the stylesheet to the `styles` array of `angular.json` (or `@import "@commerce-ai-tool/angular/styles.css";` in your global CSS); a plain `import "...styles.css"` in a TypeScript file is a bundler convenience, not an Angular CLI feature.

```typescript
import { Component } from "@angular/core";
import { CommerceAiSearchComponent } from "@commerce-ai-tool/angular";

@Component({
  imports: [CommerceAiSearchComponent],
  template: `
    <commerce-ai-search
      apiBaseUrl="/api/commerce-ai"
      theme="auto"
      currency="EUR"
      country="DE"
      [enableMissions]="true"
      [enableCart]="true"
      (productSelect)="onSelect($event)"
      (cartChange)="onCartChange($event)"
      (checkout)="onCheckout($event)"
    />
  `,
})
export class AppComponent {}
```

```css
/* src/styles.css */
@import "@commerce-ai-tool/angular/styles.css";
```

The components keep their state in signals and use `OnPush` change detection, so the widget renders correctly in zoneless hosts (the default from Angular 21, `provideZonelessChangeDetection()`), in zone-based hosts, and inside `OnPush` parents. It needs no `zone.js` polyfill and no `provideZoneChangeDetection()`.

The widget's HTTP calls use `fetch`, not `HttpClient`, so `HttpClient` interceptors do not see them. To add an auth or XSRF header, rewrite the base URL, log requests or set `redirect: "error"`, provide your own `fetch` with the `COMMERCE_AI_FETCH` injection token (it defaults to the global `fetch`):

```typescript
import { COMMERCE_AI_FETCH } from "@commerce-ai-tool/angular";

providers: [
  {
    provide: COMMERCE_AI_FETCH,
    useValue: (input: RequestInfo | URL, init?: RequestInit) =>
      fetch(input, { ...init, credentials: "include" }),
  },
],
```

Error text shown by the widget (failed search, voice, camera, cart) comes from the `messages` input, never from the server's or the browser's text; override the keys you localize.

## Theming

The widgets are styled with CSS custom properties declared on `.cat-root`, the root element of every widget. The `theme` prop (`"light"`, `"dark"` or `"auto"`, which follows `prefers-color-scheme`) sets `data-theme` on that element; the dark column below applies for `"dark"` and for `"auto"` on a dark system.

Override tokens on `.cat-root` itself, not on an ancestor: the widget stylesheet declares every token on `.cat-root` (and again per theme), so a value set on `<body>` or a wrapper never reaches it. Use `.cat-root[data-theme]` under `:root` so your rule beats the per-theme blocks regardless of stylesheet order:

```css
:root .cat-root[data-theme] {
  --cat-accent: #0f766e;
  --cat-accent-hover: #115e59;
  --cat-z-panel: 120; /* above a sticky host header */
}

:root .cat-root[data-theme="dark"] {
  --cat-accent: #5eead4;
  --cat-accent-hover: #99f6e4;
  --cat-accent-contrast: #0c0c12;
}

/* theme="auto" is dark only while the system is dark: repeat the dark values there. */
@media (prefers-color-scheme: dark) {
  :root .cat-root[data-theme="auto"] {
    --cat-accent: #5eead4;
    --cat-accent-hover: #99f6e4;
    --cat-accent-contrast: #0c0c12;
  }
}
```

| Token | Purpose | Light default | Dark default |
|-------|---------|---------------|--------------|
| `--cat-text` | Body text | `#1a1a2e` | `#f0f0f5` |
| `--cat-text-muted` | Secondary text, placeholders | `rgba(26, 26, 46, 0.65)` | `rgba(240, 240, 245, 0.6)` |
| `--cat-accent` | Brand colour: filled buttons and badges, links, active icons, price | `#4f46e5` | `#818cf8` |
| `--cat-accent-hover` | Hover fill of filled accent buttons | `#4338ca` | `#a5b4fc` |
| `--cat-accent-contrast` | Text and icons drawn on a `--cat-accent` fill | `#ffffff` | `#0c0c12` |
| `--cat-error` | Error text, error borders, recording dot | `#b91c1c` | `#f87171` |
| `--cat-success` | "Added to cart" state, order-confirmation icon | `#15803d` | `#4ade80` |
| `--cat-overlay-bg` | Search bar, suggestions, result cards and dialogs | `rgba(255, 255, 255, 0.97)` | `rgba(12, 12, 18, 0.96)` |
| `--cat-cart-panel-bg` | Cart panel; follows `--cat-overlay-bg` unless set (a see-through overlay colour makes the panel see-through too, so set this one opaque) | `var(--cat-overlay-bg)` | `var(--cat-overlay-bg)` |
| `--cat-input-bg` | Fields, chips and icon buttons | `rgba(255, 255, 255, 0.35)` | `rgba(255, 255, 255, 0.06)` |
| `--cat-overlay-shadow` | Shadow of overlays | `0 24px 80px rgba(15, 18, 40, 0.16)` | `0 24px 80px rgba(0, 0, 0, 0.28)` |
| `--cat-glass-bg` | Glass surface (cart badge ring, camera panel) | `rgba(255, 255, 255, 0.55)` | `rgba(12, 12, 18, 0.62)` |
| `--cat-glass-bg-strong` | Hover and selected surfaces | `rgba(255, 255, 255, 0.72)` | `rgba(12, 12, 18, 0.82)` |
| `--cat-glass-border` | Borders and dividers | `rgba(255, 255, 255, 0.28)` | `rgba(255, 255, 255, 0.1)` |
| `--cat-glass-shadow` | Shadow of glass surfaces | `0 24px 80px rgba(15, 18, 40, 0.12)` | `0 24px 80px rgba(0, 0, 0, 0.18)` |
| `--cat-z-dropdown` | `z-index` of the suggestions dropdown | `20` | `20` |
| `--cat-z-panel` | `z-index` of the cart panel: the popover on wide screens and the full-screen sheet at 36rem or narrower | `25` | `25` |
| `--cat-z-overlay` | `z-index` of the camera overlay when it is not rendered as a `<dialog>`. The widgets' camera `<dialog>` is in the browser top layer and ignores it. | `40` | `40` |
| `--cat-font` | Font family (no default token; falls back to Geist, Plus Jakarta Sans, system sans) | unset | unset |
| `--cat-max-width`, `--cat-search-max-width` | Width of the widget and of the search bar | `46rem` | `46rem` |
| `--cat-radius`, `--cat-shell-radius` | Corner radius of cards and of the search shell | `1.25rem`, `2rem` | same |
| `--cat-blur` | Backdrop blur strength | `20px` | `20px` |
| `--cat-ease` | Easing curve of the widget transitions | `cubic-bezier(0.32, 0.72, 0, 1)` | same |
| `--cat-border`, `--cat-surface` | Aliases of `--cat-glass-border` and `--cat-input-bg`, kept for hosts that already use them | alias | alias |

Contrast: the defaults meet WCAG 2.2 AA (4.5:1 for text) in both themes, and `pnpm lint` fails if a stylesheet change breaks that (`scripts/check-contrast.mjs` checks the token pairs and every rule that sets both a text and an opaque background colour). The check assumes the widget sits on a white page (light) or on `#0c0c12` (dark). If you override `--cat-accent`, check the new colour against `--cat-accent-contrast` as well: filled buttons draw their label in `--cat-accent-contrast`, which is white in the light theme and near-black in the dark one, and accent-coloured text (prices, links) also has to reach 4.5:1 on your overlay colour.

Since 3.0.0 the default light accent is darker (`#4f46e5`, was `#6366f1`), the dark theme draws filled accent controls with dark text, errors are `#b91c1c` / `#f87171`, and the cart panel follows `--cat-overlay-bg`. Hosts that set their own `--cat-accent` keep their colour; set `--cat-accent-contrast` too if it is not dark enough for white text (light) or light enough for dark text (dark).

Form fields use at least 16px on viewports 36rem wide or narrower and on touch devices (`pointer: coarse`), which stops iOS Safari from zooming the page when a field is focused. Do not work around zoom with `maximum-scale` in your viewport meta tag; it blocks pinch zoom.

## Error responses

Every non-2xx response from the host routes is JSON: `{ "error": string, "code": ApiErrorCode }` (types exported from `@commerce-ai-tool/core/client`).

| Status | `code` | When |
|--------|--------|------|
| 400 | `VALIDATION` | Malformed or non-object JSON body, missing or invalid fields, input over a [cap](CONFIGURATION.md#rate-limits-and-input-caps), more than one uploaded file |
| 400 | `MISSING_PRICE`, `CHECKOUT_INCOMPLETE`, `PAYMENT_NOT_CONFIGURED` | Cart or checkout preconditions not met |
| 401 | `INVALID_CREDENTIALS`, `SESSION_INVALID` | Login failed (the documented commercetools `InvalidCredentials` error only), or a cart session token that is invalid, expired or revoked (a missing token falls back to the guest `anonymousId`; without one the request is a 400 `VALIDATION`) |
| 402 | `PAYMENT_DECLINED` | Payment provider declined |
| 403 | `CART_ACCESS_DENIED` | Cart belongs to another session |
| 404 | `CART_NOT_FOUND`, `ORDER_NOT_FOUND` | Unknown cart or order |
| 404 | `NOT_FOUND` | Unknown route, or wrong method, on the Next.js catch-all (`createNextRouteHandler`) |
| 413 | `PAYLOAD_TOO_LARGE` | JSON body over 64 KB, uploaded image over 8 MiB, uploaded audio over 10 MiB (see [size limits](CONFIGURATION.md#upload-and-body-size-limits)) |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | JSON route called without `Content-Type: application/json`; voice or image route called without `multipart/form-data`; image that is not JPEG, PNG or WebP; audio outside the supported list |
| 429 | `RATE_LIMITED` | AI, suggestions, login, order or payment rate limit (see `Retry-After`), or the AI provider answering that it is busy |
| 499 | `INTERNAL` | The client closed the request (the abort signal fired). Nobody reads the body, and it is not logged as an error |
| 503 | `UPSTREAM_UNAVAILABLE` | Optional capability not configured (voice speech-to-text, TTS), Product Search not enabled on the project (fallback off), or the AI provider unavailable (credits, 5xx, connection failure) or cut off at its output cap |
| 504 | `TIMEOUT` | Search pipeline step timed out |
| 500 | `INTERNAL` | Any unexpected error |

For `INTERNAL`, `error` is a generic per-route message such as `Search failed`. The underlying error message is never sent to the browser. It is logged server-side as `[commerce-ai-tool/server] <handler> failed (<code>): <ErrorName>: <message>` at error level with quoted values, e-mail addresses and phone numbers redacted; the full message, request context, stack and cause are logged only with `CAT_DEBUG=true` (see [observability](OBSERVABILITY.md)). Match on `code`, not on the `error` text.

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

With `enableFacets`, category chips filter through Product Search `postFilter` (the categories group keeps its other buckets; other chips filter in the main query unless the request sends `facetSelections`), price chips follow the currency of the `price` facet group (`SearchFacetGroup.currency`; a widget talking to an older server falls back to 2 fraction digits), and category chips show localized names. Product cards and add-to-cart use the variant that matched the search filters. See [faceted navigation](SEARCH-PIPELINE.md#faceted-navigation-query-vs-postfilter).

### Keyboard focus in the overlays

The camera preview is a native modal `<dialog>` (opened with `showModal()`, so the page behind it is inert and the browser draws its own `::backdrop`, which the widget makes transparent). Focus moves to the capture button on open (to the dismiss button while an error shows), Tab and Shift+Tab wrap inside it, Escape closes it or dismisses the error, and focus returns to the camera button. If you style or test the overlay, select `dialog.cat-camera-overlay` rather than a `div`.

The cart is a popover next to the search field on wide screens and a full-screen sheet at 36rem or narrower. Escape closes it at every width and focus returns to the cart toggle. Only the full-screen sheet carries `role="dialog"` and `aria-modal="true"`; there focus moves to the close button on open and Tab wraps inside the sheet. The cart toggle exposes `aria-expanded` (not `aria-pressed`), and the quantity "+" button is disabled at 99, the server maximum.

### React hooks: ordering and cleanup

`useCommerceAISearch` and `useVoiceSearch` can be used without the widget. Starting any search (text, refine, image, voice) aborts the one in flight, and a response that lost the race is dropped, so a slow image or voice result never replaces a newer text search. Unmounting aborts pending requests, clears debounce timers, stops the microphone (every `MediaStream` track and the `MediaRecorder`, also when the permission prompt resolves after unmount) and stops spoken-summary playback.

To order a voice search against the others, pass two members of the search hook to the voice hook:

```tsx
const search = useCommerceAISearch({ apiBaseUrl });
const voice = useVoiceSearch({
  apiBaseUrl,
  beginExternalSearch: search.beginExternalSearch,
  isCurrentRequest: search.isCurrentRequest,
  onResults: (products, meta) => search.applySearchResult({ products, meta }),
});
```

| Member of `useCommerceAISearch` | Role |
|------|------|
| `beginExternalSearch()` | Claims the "current search" slot for a request that runs outside the hook. Aborts the in-flight search, cancels pending debounced searches, forgets clicked facet chips, and returns `{ requestId, signal }`. Pass `signal` to your request. |
| `isCurrentRequest(requestId)` | `true` while `requestId` is still the latest search. Check it before applying a response. |

Both are optional on `useVoiceSearch`; without them it only guards against its own earlier recordings. `useVoiceSearch().audioClip` (a `Blob`) is what to replay; the base64 `audioSummary` field of the hook was removed in 3.0.0. In a custom UI with a file input, reset `input.value = ""` after reading the file, as the widget does, so choosing the same image again searches again.

How a query is interpreted and sent to commercetools: [search pipeline](SEARCH-PIPELINE.md). Facets, missions, and cart flags are documented there and in [cart and checkout](CART-AND-CHECKOUT.md).
