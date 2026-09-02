# Commerce AI Tool — Agent Instructions

## Language (mandatory)

**All project files must be written in English.**

This includes source code, tests, configuration, documentation, comments, Cursor rules, commit messages, and user-facing strings in the codebase. Do not create or edit repository files in Polish or any other language.

The agent may reply to users in their preferred language in chat, but every artifact committed to the repo stays in English.

## What this project is

pnpm + Turborepo monorepo with an AI plugin for **commercetools** product search. API keys (OpenRouter/Bedrock, ElevenLabs, commercetools) **never reach the browser** — the UI widget calls only the host server's API routes.

```
Browser Widget → Host API (@commerce-ai-tool/server) → AI + ElevenLabs + commercetools
```

### Packages

| Package | Path | Responsibility |
|---------|------|----------------|
| `@commerce-ai-tool/core` | `packages/core` | Business logic, AI, commercetools client |
| `@commerce-ai-tool/server` | `packages/server` | Next.js / Express handlers, STT/TTS |
| `@commerce-ai-tool/react` | `packages/react` | React/Next.js widget (glass UI) |
| `@commerce-ai-tool/angular` | `packages/angular` | Angular component |
| `demo-next` | `apps/demo-next` | Demo app (Next.js 16) |

Package dependencies: `server`, `react`, `angular` → `core`.

## Environment requirements

- **Node.js** ≥ 24 (CI: 24)
- **pnpm** 9.15.9 (`packageManager` in root `package.json` — do not override version in workflows)
- **Turbo** 2.x — task orchestration

## Tech stack

| Layer | Libraries |
|-------|-----------|
| Language / build | TypeScript 7.0 (`tsc`), `@typescript/typescript6` for legacy Compiler API consumers, tsup 8, ESM + CJS |
| Monorepo | pnpm workspaces, Turborepo |
| Unit tests | Vitest 3 (`packages/**/*.test.ts`) |
| Lint | ESLint 9 + typescript-eslint |
| AI | `@openrouter/sdk`, `@aws-sdk/client-bedrock-runtime` |
| Commerce | `@commercetools/platform-sdk`, `@commercetools/sdk-client-v2` (REST Product Search + GraphQL card hydrate via `apiRoot.graphql()`) |
| Voice | `@elevenlabs/elevenlabs-js` (server) |
| React UI | React ≥ 18, lucide-react |
| Angular UI | Angular ≥ 17, RxJS ≥ 7 |
| Demo | Next.js 16, React 19 |

Add new dependencies in the **specific package** `package.json`, not root (except shared dev tools).

## TypeScript 7

TypeScript 7 ships a native `tsc` (Go) without the JavaScript Compiler API. The monorepo uses a **side-by-side** setup via pnpm catalog entries in `pnpm-workspace.yaml`:

| Catalog key | Package | Used for |
|-------------|---------|----------|
| `typescript-native` | `typescript@^7.0.2` (as `@typescript/native`, catalog) | `tsc --noEmit`, `tsc --emitDeclarationOnly`, library builds |
| `typescript-api` | `@typescript/typescript6@^6.0.2` (npm alias `typescript`, catalog) | `typescript-eslint`, Next.js (`demo-next` only) |

**Where to declare dependencies**

- **Library packages** (`core`, `server`, `react`, `angular`): `@typescript/native` only.
- **Root** and **`demo-next`**: both `@typescript/native` and `typescript` (API alias).
- **Next.js 16.3+**: `demo-next` sets `experimental.useTypeScriptCli: false` so `next build` uses the TypeScript 6 JS API. CLI mode looks for `typescript/bin/tsc`, which `@typescript/typescript6` does not ship (`tsc6` only).

**Declaration emit** — do not use `tsup` `dts: true` (relies on deprecated Compiler API and injects `baseUrl`). Instead:

```bash
tsup && node ../../scripts/emit-package-dts.mjs dist/index.d.ts [more entries...]
```

Each library has `tsconfig.build.json` (excludes `*.test.ts`) for emit.

**TS 7 config defaults** — set explicit `"types": ["node"]` in tsconfigs that use Node globals; add `declare module "*.css"` for side-effect CSS imports.

**Future cleanup (when TypeScript 7.1+ ships a programmatic API and tooling adopts it)**

1. Remove `typescript-api` / `@typescript/typescript6` from root and `demo-next`.
2. Point `typescript-eslint` and Next.js at the new API (or drop the alias once peers allow TS 7).
3. Re-evaluate whether `emit-package-dts.mjs` can be replaced by a single native emit step.

## Commands

```bash
pnpm install              # install
pnpm build                # build all packages
pnpm dev                  # dev (demo-next :3000 + library watch)
pnpm lint                 # ESLint
pnpm typecheck            # tsc --noEmit
pnpm test                 # Vitest
pnpm eval:promptfoo       # LLM prompt evals (local, requires OPENROUTER_API_KEY)
pnpm eval:promptfoo:voice
pnpm eval:promptfoo:image
pnpm eval:promptfoo:voice-enhance
pnpm eval:promptfoo:voice-tts
pnpm eval:promptfoo:mission
pnpm eval:promptfoo:redteam
pnpm eval:promptfoo:redteam:generate
pnpm eval:promptfoo:view  # Promptfoo results web UI
pnpm eval:fixtures:audio
pnpm eval:fixtures:images
```

Before finishing a feature, run **all of the above** (same order as CI), except prompt evals which are optional and local-only.

## Prompt evaluations (Promptfoo)

Local LLM regression tests live in [`evals/`](evals/). They call the same `createAIProvider` paths as production (text, image, voice enhance/TTS, missions, redteam).

- **Setup:** `cp evals/.env.example evals/.env` and set `OPENROUTER_API_KEY`
- **Run:** `pnpm eval:promptfoo` and suite-specific `pnpm eval:promptfoo:*` scripts (see [`evals/README.md`](evals/README.md))
- **Bedrock matrix:** text, image, and voice baseline configs include optional Bedrock columns (`skipIfUnavailable: true` — skipped when `AWS_REGION` is unset)
- **Local only** — not run in GitHub Actions. Requires `OPENROUTER_API_KEY` (and optional AWS) and incurs LLM cost

Vitest (`pnpm test`) remains mandatory in CI for deterministic parser/builder logic.

## Quality gates (mandatory)

Every new feature **must** satisfy:

1. **Unit tests** — always, for new business logic and regressions
2. **E2E** — when the feature covers a full user flow (UI → API → integration); no E2E framework yet — add tests on the first such flow
3. **`pnpm lint`** — zero ESLint errors
4. **`pnpm typecheck`** — zero TypeScript errors
5. **`pnpm test`** — all tests green
6. **`pnpm build`** — green monorepo build

Do not finish a task with a failing lint, typecheck, test, or build.

**Before every commit:** run `pnpm lint && pnpm typecheck && pnpm test && pnpm build` and only commit when all four pass. Never push a commit that breaks CI.

## Where to write tests

- Files: `*.test.ts` next to source or in the same directory
- Reference: `packages/core/src/prompts/index.test.ts`
- Test imports: `.js` extension (ESM), e.g. `from "./index.js"`
- `core`, `server`: `test` script in `package.json`
- `react`, `angular`: add `vitest run` to `package.json` when adding first tests

## Implementation conventions

- **Minimal diff** — only what the task requires
- **English** in code, comments, docs, and public APIs
- **Secrets** server-side only (`loadConfigFromEnv`, `.env.local`)
- **tsup watch**: `clean: !isWatch` — do not wipe `dist/` in dev (avoids monorepo races)
- **Turbo `dev`**: libraries wait for `^build` + own `build` before watch
- Widget modalities are independent: `enableVoice`, `enableCameraSearch`, and `enableImageSearch` must not gate one another
- Unused variables: `_` prefix or remove import (ESLint rule)
- Public API changes → update README / CHANGELOG / changeset

## CI (GitHub Actions)

Workflow `.github/workflows/ci.yml` on every PR/push to `main`:

`lint` → `typecheck` → `test` → `build`

`pnpm test` is Vitest unit tests only. Promptfoo LLM evals and other live calls to OpenRouter, Langfuse, Bedrock, or commercetools are not run in GitHub Actions (no API secrets required).

Release (`.github/workflows/release.yml`) is disabled (`workflow_dispatch` only) until npm is configured.

## Typical feature structure

1. Logic in `packages/core` (+ unit tests)
2. Endpoints in `packages/server` (+ handler unit tests)
3. UI in `packages/react` or `packages/angular` (+ component/hook tests)
4. Integration in `apps/demo-next` (+ E2E if user flow applies)
5. Full verification: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`

## Locale model

- **`catalogLocale`** — commercetools index language (`fullText.language`, `localeProjection`). Set via `CAT_CATALOG_LOCALE` or per-request/widget override.
- **`queryLocale`** — user input language for AI interpretation. Defaults to `catalogLocale` when omitted.
- AI returns `searchTerms` in catalog language; product cards use catalog language.
- Each `searchTerms` element is a complete catalog-language phrase. Product Search ORs phrases (specific query → one phrase; broad category intent → 3–5 synonym/hyponym phrases). Do not split one product query into separate words.
- Autocomplete: CT Search Term Suggestions on `searchKeywords` first; multi-word prefixes retry the last token and keep hits that contain every query token; if none remain and the query is cross-locale or multi-word NL, AI proposes catalog-language suggestion phrases (`suggestSearchTerms`). Typed-query passthrough into Product Search runs only when `queryLocale` and `catalogLocale` share a language. Projection Search fallback uses the first `searchTerms` phrase only.
- Resolver: `packages/core/src/locale/resolve.ts` (`resolveSearchLocales`).
- Dev tracing: `logSearchTrace` in `packages/core/src/utils/dev-trace.ts` (enabled when `NODE_ENV !== production` or `CAT_DEBUG=true`).
- Langfuse (opt-in): set `LANGFUSE_PUBLIC_KEY` + `LANGFUSE_SECRET_KEY`; core wraps AI + commercetools spans under the HTTP request span; autocomplete suggestions are not traced unless `LANGFUSE_TRACE_SUGGESTIONS=true`. Host registers `LangfuseSpanProcessor` (see `apps/demo-next/src/instrumentation.ts` and `@commerce-ai-tool/server/flush`). Complements `CAT_DEBUG`; see README “Langfuse (AI observability)”. Optional managed system prompts: `LANGFUSE_PROMPTS=true` or `CommerceAIConfig.langfuse.promptsEnabled` (applied by `createSearchOrchestrator` via `configureLangfusePrompts`) + `pnpm sync:langfuse-prompts` (default label `staging`; promote with `--label production` after evals). Git catalog remains source of truth / eval fallback (`createEvalAIProvider` forces local prompts).
- **Shopping missions** — opt-in via `CommerceAIConfig.missions` / `CAT_MISSIONS_*` or per-request `enableMissions`. A fresh text search runs `interpretTextQuery` and `decomposeShoppingMission` in parallel (`commerce-ai/mission-query`); that is one extra LLM call. Usable missions (confidence, ≥2 intents) fan out bounded Product Search calls. Voice, image, and Angular are not on this path yet.

## Cart session

- **Guest** — `anonymousId` in `localStorage` (`commerce-ai-tool:anonymousId`); the server looks up the Active cart by `anonymousId`.
- **Customer** — HMAC session token (`commerce-ai-tool:customerSession`) signed with `CAT_CART_SESSION_SECRET` (falls back to `CTP_CLIENT_SECRET`). A valid token wins over `anonymousId`. `GET /cart` sends it as `x-commerce-ai-cart-session` (never as a query parameter); mutations send `sessionToken` in the JSON body.
- **Batch add** — `POST /cart/add-items` adds 1–20 line items in one commercetools Cart update (mission “add all”).
- **Login** — commercetools `POST /{projectKey}/login` with `anonymousCartSignInMode: MergeWithExistingCustomerCart`. A client `cartId` is merged only after the cart is loaded and `cart.anonymousId` matches the request `anonymousId`. Passwords are never logged or sent to Langfuse. Catalog `storeKey` is not applied to login (cart CRUD is project-scoped). Express `POST /cart/login` is rate-limited (10 attempts / 15 minutes per IP); Next handlers apply the same cap in memory.
- **Logout** — client drops the token and rotates `anonymousId` (stateless `POST /cart/logout`).
- **Checkout** — the widget calls host `onCheckout(cart)`; the host route renders `CommerceAICheckout`. Checkout reuses the cart identity model for `POST /cart/addresses`, `GET /cart/shipping-methods`, `POST /cart/shipping-method`, `GET /cart/payment-methods`, `POST /cart/payment`, and `POST /cart/order`. Order creation requires an Active, non-empty cart with a shipping address and a selected matching Shipping Method when methods are available. When a `PaymentProvider` is configured, a successful Authorization Payment must be linked to the Cart before the Order. Express `POST /cart/order` and `POST /cart/payment` are rate-limited (20 attempts / 15 minutes per IP); Next handlers apply the same cap in memory. `GET /orders` returns `{ orders }` for the current cart identity. `GET /orders?orderNumber=` returns `{ order }` for that number.
- **Payments** — hosts inject `CommerceAIConfig.payments.provider` (`PaymentProvider`). Core creates a commercetools Payment resource and `addPayment` on the Cart; the library does not ship a PSP or fake successful charges. The demo app uses a mock adapter only.

## Key config files

| File | Role |
|------|------|
| `turbo.json` | Monorepo task dependencies |
| `tsconfig.base.json` | Shared TypeScript options |
| `scripts/emit-package-dts.mjs` | Native `tsc` declaration emit + `.d.cts` copy for libraries |
| `eslint.config.mjs` | Root ESLint flat config |
| `vitest.config.ts` | `packages/**/*.test.ts` pattern |
| `apps/demo-next/.env.example` | Required environment variables |
| `evals/` | Promptfoo LLM prompt evaluations (local only) |
| `.cursor/rules/` | Cursor agent rules (English only) |
