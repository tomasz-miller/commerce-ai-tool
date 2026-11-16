# Commerce AI Tool — Agent Instructions

Product documentation lives in [`docs/`](docs/README.md). This file is for coding agents: toolchain, quality gates, and English-only rules.

## Language (mandatory)

**All project files must be written in English.**

This includes source code, tests, configuration, documentation (`docs/`, README, this file), comments, Cursor rules, commit messages, and user-facing strings in the codebase. Do not create or edit repository files in Polish or any other language.

The agent may reply to users in their preferred language in chat, but every artifact committed to the repo stays in English.

## What this project is

pnpm + Turborepo monorepo with an AI plugin for **commercetools** product search. API keys (OpenRouter/Bedrock, ElevenLabs, commercetools) **never reach the browser** — the UI widget calls only the host server's API routes.

```
Browser Widget → Host API (@commerce-ai-tool/server) → AI + ElevenLabs + commercetools
```

### Packages

| Package | Path | Responsibility |
|---------|------|----------------|
| `@commerce-ai-tool/core` | `packages/core` | Business logic, AI, commercetools client. Entries: `.` (public, semver-covered API), `./client` (browser-safe, used by react/angular), `./internal` (helpers shared with server/evals/scripts, no semver guarantee) |
| `@commerce-ai-tool/server` | `packages/server` | Next.js / Express handlers, STT/TTS |
| `@commerce-ai-tool/react` | `packages/react` | React/Next.js widget (glass UI) |
| `@commerce-ai-tool/angular` | `packages/angular` | Angular widget components and services (Angular Package Format via ng-packagr, partial compilation) |
| `@commerce-ai-tool/styles` | `packages/styles` | Shared widget CSS (private; inlined into React `dist/index.css`, copied as an asset into the Angular package) |
| `demo-next` | `apps/demo-next` | Demo app (Next.js 16) |
| `demo-angular` | `apps/demo-angular` | Demo app (Angular 21 + Express BFF) |

Package dependencies: `server`, `react`, `angular` → `core`. `core`, `server`, `react` and `angular` are one fixed Changesets group (same version, released together); `styles` and the demos are never published.

### Where things live

- `packages/core/src/search/` — search pipelines. `orchestrator.ts` is the composition root; `context.ts`, `product-search.ts`, `text-search.ts`, `voice-search.ts`, `image-search.ts`, `mission-search.ts` and `suggest.ts` hold the per-pipeline logic. `ai/`, `commercetools/`, `prompts/`, `observability/` and `payments/` sit next to it.
- `packages/core/src/browser/` — client logic shared by React and Angular (API client, cart session store, storage, camera, audio, mission cart, focus, announcements, error messages, facet chips), exported through `@commerce-ai-tool/core/client`. It must stay browser-safe: ESLint forbids React, Angular, Node built-ins and server-only core modules there.
- `packages/core/src/index.ts` is the public API: add a name there only as a deliberate public API decision (`public-api.test.ts` pins the list). Implementation helpers are re-exported from `packages/core/src/internal.ts` (`@commerce-ai-tool/core/internal`); `server`, `evals/` and `scripts/` import helpers from there, and hosts must not. `tsup` runs with `splitting: true` so the three entries share one module instance (Langfuse prompt config, caches).
- `packages/core/src/types/api.ts` — HTTP wire types and `ApiErrorCode`. `packages/core/src/config/defaults.ts` — shared constants and limits.
- `packages/server/src/routes.ts` — the single route table (path, method, body type, rate-limit bucket). `express.ts` registers it, `next-route.ts` (catch-all `[...path]` handler) and `next.ts` (one function per route) dispatch from it through `next-dispatch.ts`. `errors.ts` and `route-actions.ts` map errors onto the HTTP contract.
- `packages/angular/src/lib/search/` — signal store (`commerce-ai-search.store.ts`) and child components; `search-compat.ts` is the abstract directive that keeps the public `CommerceAiSearchComponent` inputs.
- `scripts/` — `emit-package-dts.mjs`, `inline-core-client-dts.mjs`, `check-angular-apf.mjs`, `check-angular-consumer.mjs`, `check-contrast.mjs` (the `lint` script of `packages/styles`), `print-commands.mjs` (see Commands).

## Environment requirements

- **Node.js** ≥ 24 (`engines` in the root and every published package; CI: 24)
- **pnpm** 11.22.0 (`packageManager` in root `package.json` — do not override version in workflows)
- **Turbo** 2.x — task orchestration

## Tech stack

| Layer | Libraries |
|-------|-----------|
| Language / build | TypeScript 7.0 (`tsc`), `@typescript/typescript6` for legacy Compiler API consumers, tsup 8 (`core`, `server`, `react`), ng-packagr 20.3 (`angular`), ESM + CJS (Angular: ESM only) |
| Monorepo | pnpm workspaces, Turborepo, Changesets (fixed group) |
| Unit tests | Vitest 5 (`packages/**/*.test.ts`, plus root `evals/` and `scripts/`) |
| E2E | Playwright (`apps/demo-next/e2e`, `apps/demo-angular/e2e`) |
| Lint | ESLint 10 + typescript-eslint (type-aware rules on `packages/core/src` non-test files via `projectService`, which loads the TS 6 API alias fine; `eslint-plugin-react-hooks` recommended on `packages/react` and `apps/demo-next`; `no-restricted-imports` guard on `packages/core/src/browser`) |
| AI | `@openrouter/sdk`, `@aws-sdk/client-bedrock-runtime` |
| Commerce | `@commercetools/ts-client` + `@commercetools/platform-sdk` 9 (REST Product Search + GraphQL card hydrate via `apiRoot.graphql()`). Two clients share one token: reads retry, mutations do not (see docs/CONFIGURATION.md) |
| Voice | `@elevenlabs/elevenlabs-js` (server) |
| React UI | React ≥ 19 (peer), lucide-react |
| Angular UI | Angular ^20.3 \|\| ^21 \|\| ^22 (peer; compiled on 20.3), RxJS ≥ 7 |
| Demo | Next.js 16 + React 19; Angular 21.2 (zoneless) |

Add new dependencies in the **specific package** `package.json`, not root (except shared dev tools).

## TypeScript 7

TypeScript 7 ships a native `tsc` (Go) without the JavaScript Compiler API. The monorepo uses a **side-by-side** setup via pnpm catalog entries in `pnpm-workspace.yaml`:

| Catalog key | Package | Used for |
|-------------|---------|----------|
| `typescript-native` | `typescript@^7.0.2` (as `@typescript/native`, catalog) | `tsc --noEmit`, `tsc --emitDeclarationOnly`, library builds |
| `typescript-api` | `@typescript/typescript6@^6.0.2` (npm alias `typescript`, catalog) | `typescript-eslint`, Next.js (`demo-next` only) |

**Where to declare dependencies**

- **Library packages** (`core`, `server`, `react`): `@typescript/native` only.
- **`packages/angular`** is the exception: it builds with ng-packagr, whose Angular compiler needs the TypeScript range `@angular/compiler-cli` declares as its peer (`>=5.8 <6.0` for 20.3), so it declares `typescript: ~5.9.3` and never `@typescript/native` or the TS 6 alias. Its `tsc --noEmit` typecheck uses that same TypeScript.
- **Root** and **`demo-next`**: both `@typescript/native` and `typescript` (API alias).
- **`demo-angular`**: `typescript ~5.9.x` (Angular 21.2 compiler-cli peers `>=5.9 <6.1`); Angular 22 needs TS 6 and is deferred until the TS 7 API lands.
- **Next.js 16.3+**: `demo-next` sets `experimental.useTypeScriptCli: false` so `next build` uses the TypeScript 6 JS API. CLI mode looks for `typescript/bin/tsc`, which `@typescript/typescript6` does not ship (`tsc6` only).

**Declaration emit** (`core`, `server`, `react`) — do not use `tsup` `dts: true` (relies on deprecated Compiler API and injects `baseUrl`). Instead:

```bash
tsup && node ../../scripts/emit-package-dts.mjs dist/index.d.ts [more entries...]
```

Each tsup-built library has `tsconfig.build.json` (excludes `*.test.ts`) for emit. `packages/angular` does not use tsup or `emit-package-dts.mjs`: see below.

**Angular package build** — `pnpm --filter @commerce-ai-tool/angular build` runs `ng-packagr -p ng-package.json -c tsconfig.lib.prod.json` (partial compilation, `strictTemplates`) and then `scripts/check-angular-apf.mjs`, which fails the build if the output is not partial-compiled or the typings lose the `messages` input type. ng-packagr 20.3 resolves relative imports without the `.js` extension, so relative imports in `packages/angular/src` are extensionless (ng-packagr 21 strips `.js`). The published package is the `dist/` folder: `publishConfig.directory: "dist"` makes `pnpm pack` / `pnpm publish` ship it (and replace `workspace:*`), and `linkDirectory: true` makes workspace consumers (demo-angular) link `dist` instead of the source. `@commerce-ai-tool/core` is a regular `dependency` allowed in `ng-package.json` (`allowedNonPeerDependencies`); the library imports only `@commerce-ai-tool/core/client`. The CI job `angular-consumer` (`scripts/check-angular-consumer.mjs`) builds a fresh standalone app from `scripts/fixtures/angular-consumer` against the packed tarballs.

**TS 7 config defaults** — set explicit `"types": ["node"]` in tsconfigs that use Node globals; add `declare module "*.css"` for side-effect CSS imports.

**Future cleanup (when TypeScript 7.1+ ships a programmatic API and tooling adopts it)**

1. Remove `typescript-api` / `@typescript/typescript6` from root and `demo-next`.
2. Point `typescript-eslint` and Next.js at the new API (or drop the alias once peers allow TS 7).
3. Re-evaluate whether `emit-package-dts.mjs` can be replaced by a single native emit step.

## Commands

Generated from the root `package.json` scripts by `scripts/print-commands.mjs`. When you add, rename or remove a root script, add its description to that script and run `node scripts/print-commands.mjs --write`; `pnpm test` fails while the block below differs.

<!-- commands:start (generated by scripts/print-commands.mjs, do not edit) -->
```bash
pnpm install                                    # install
pnpm build                                      # build all packages (Turborepo)
pnpm dev                                        # demo-next :3000 + demo-angular :4200 / BFF :3002 + library watch
pnpm dev:react                                  # React/Next host only (:3000)
pnpm dev:angular                                # Angular host only (:4200 + Express BFF on :3002)
pnpm lint                                       # ESLint
pnpm typecheck                                  # tsc --noEmit
pnpm test                                       # Vitest unit tests (packages, plus root tests under evals/ and scripts/)
pnpm check:package                              # attw + publint on each published package (run after build)
pnpm check:consumer                             # type-check the packed core, server and react from a node16 CommonJS and ESM consumer, skipLibCheck off (run after build)
pnpm clean                                      # remove build output and node_modules
pnpm changeset                                  # add a changeset for a user-visible change
pnpm version-packages                           # apply changesets (what the Version packages PR does)
pnpm release                                    # build + changeset publish (CI release job only; see docs/DEVELOPMENT.md)
pnpm eval:promptfoo                             # LLM evals, text search (local, requires OPENROUTER_API_KEY)
pnpm eval:promptfoo:voice                       # LLM evals, voice
pnpm eval:promptfoo:image                       # LLM evals, image
pnpm eval:promptfoo:voice-enhance               # LLM evals, voice transcript cleanup
pnpm eval:promptfoo:voice-tts                   # LLM evals, voice result summaries
pnpm eval:promptfoo:mission                     # LLM evals, shopping missions
pnpm eval:promptfoo:suggest                     # LLM evals, autocomplete suggestions
pnpm eval:promptfoo:refine                      # LLM evals, natural-language refine
pnpm eval:promptfoo:retrieval                   # LLM evals, interpretation + live Product Search
pnpm eval:models                                # cheaper-model matrix on the retrieval suite
pnpm eval:promptfoo:redteam                     # red-team probes on text search
pnpm eval:promptfoo:redteam:generate            # generate the red-team test cases
pnpm eval:promptfoo:redteam:untrusted           # red-team probes on voice, refine and image inputs
pnpm eval:promptfoo:redteam:untrusted:generate  # generate the untrusted-input red-team cases
pnpm eval:promptfoo:view                        # Promptfoo results web UI
pnpm eval:fixtures:audio                        # generate WAV voice fixtures (macOS only)
pnpm eval:fixtures:images                       # compress JPEG vision fixtures
pnpm eval:fixtures:catalog                      # snapshot live catalog fixtures for retrieval golden SKUs
pnpm test:e2e                                   # Playwright, mocked backends, no secrets (run after build)
pnpm seed:search-keywords                       # seed commercetools searchKeywords for autocomplete
pnpm sync:langfuse-prompts                      # push git prompts to Langfuse
```
<!-- commands:end -->

Before finishing a feature, run the commit gate (below) plus `pnpm check:package` and `pnpm check:consumer`, and `pnpm test:e2e` when the change touches a user flow. Prompt evals are optional and local-only.

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
2. **E2E (Playwright)** — required when a change touches a full user flow (widget UI → host API route → response), for example search, cart, checkout, orders, camera or voice overlays. Add or extend a spec under `apps/demo-next/e2e` and, when the Angular widget is affected, `apps/demo-angular/e2e`. Pure logic, types, docs and styles-only changes do not need one.
3. **`pnpm lint`** — zero ESLint errors
4. **`pnpm typecheck`** — zero TypeScript errors
5. **`pnpm test`** — all tests green
6. **`pnpm build`** — green monorepo build
7. **`pnpm check:package`** and **`pnpm check:consumer`** — after `pnpm build`, when package metadata, exports, build scripts or public types changed (CI runs both every time)

Do not finish a task with a failing lint, typecheck, test, or build.

**Before every commit:** run `pnpm lint && pnpm typecheck && pnpm test && pnpm build` and only commit when all four pass; add `pnpm check:package` and `pnpm check:consumer` after the build and `pnpm test:e2e` as described above. Never push a commit that breaks CI.

### E2E notes

- `pnpm test:e2e` runs `demo-next` (starts `next dev` on :3001 with `CAT_DEMO_MOCK_PAYMENTS`) and then `demo-angular` (starts its own `ng serve` on :4201 after `ng cache clean`; port 4201 must be free). Every backend call is mocked in the specs (`page.route`), so no secrets are needed.
- Both demos consume the built `dist/` of the libraries: run `pnpm build` first (CI builds `./packages/*`).
- First run needs the browser: `pnpm --filter demo-next exec playwright install --with-deps chromium`.
- `demo-next` specs open pages with `gotoHydrated` (`apps/demo-next/e2e/helpers.ts`), which waits for `data-hydrated` on `<html>` so handlers are attached before the first click.
- Set `PLAYWRIGHT_BASE_URL` to test against a server you started yourself.

## Where to write tests

- Files: `*.test.ts` next to source or in the same directory; root tests live in `evals/` and `scripts/`
- Reference: `packages/core/src/prompts/index.test.ts`
- Test imports: `.js` extension (ESM), e.g. `from "./index.js"` — **except in `packages/angular`**, where ng-packagr 20.3 requires extensionless relative imports (`from "./commerce-ai-search.store"`)
- Every published package has a `test` script (`vitest run`); `packages/angular` tests run in jsdom, zoneless, through `vitest.angular-jit.ts`
- `demo-next` has no unit tests (`pnpm test` echoes that); cover it with Playwright

## Implementation conventions

- **Minimal diff** — only what the task requires
- **English** in code, comments, docs, and public APIs
- **Secrets** server-side only (`loadConfigFromEnv`, `.env.local`)
- **tsup watch**: `clean: !isWatch` — do not wipe `dist/` in dev (avoids monorepo races). The Angular library's `dev` script runs `ng-packagr --watch` with the prod (partial) tsconfig, because demo-angular links `dist` and runs a newer Angular runtime than the one the library compiles on; full-Ivy output would not be portable.
- **Turbo `dev`**: libraries wait for `^build` + own `build` before watch
- Widget modalities are independent: `enableVoice`, `enableCameraSearch`, and `enableImageSearch` must not gate one another
- Unused variables: `_` prefix or remove import (ESLint rule)
- Public API or behavior changes → update the matching page under [`docs/`](docs/README.md), plus CHANGELOG / changeset.

## CI (GitHub Actions)

Workflow `.github/workflows/ci.yml` on every PR/push to `main`, three independent jobs:

- `ci`: `pnpm audit --prod` → `lint` → `typecheck` → `test` → `build` → `check:package` → `check:consumer`
- `e2e`: build libraries, install Chromium, `pnpm test:e2e` (mocked backends, no secrets)
- `angular-consumer`: `scripts/check-angular-consumer.mjs --angular 20.3|21.2` builds a fresh Angular app against the packed tarballs; it also runs weekly on a `schedule:` trigger (only this job, so Angular patch drift shows up outside PRs)

`release.yml` reuses `ci.yml` as its `verify` job and publishes only after it passes. Actions are pinned to commit SHAs; Dependabot keeps them and npm dependencies current (`.github/dependabot.yml`). Dependabot npm minor/patch PRs (group `minor-and-patch`) auto-merge after the required CI checks pass (`dependabot-auto-merge.yml`, ruleset `main-required-checks`); GitHub Actions bumps and majors are merged by hand.

`pnpm test` is Vitest unit tests only. Promptfoo LLM evals and other live calls to OpenRouter, Langfuse, Bedrock, or commercetools are not run in GitHub Actions (no API secrets required).

Release (`.github/workflows/release.yml`) runs on push to `main` (and `workflow_dispatch`): Changesets opens a "Version packages" PR and publishes after it merges, with npm trusted publishing (OIDC). Do not publish from feature branches; publish only through `pnpm publish` / `changeset publish` from the package root (never `npm publish` inside `packages/angular/dist`). Details: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md). Add a changeset (`pnpm changeset`) for every user-visible change to a published package. `demo-next`, `demo-angular` and `@commerce-ai-tool/styles` are never published.

## Typical feature structure

1. Logic in `packages/core` (+ unit tests)
2. Endpoints in `packages/server` (+ handler unit tests)
3. UI in `packages/react` or `packages/angular` (+ component/hook tests)
4. Integration in `apps/demo-next` or `apps/demo-angular` (+ Playwright E2E if a user flow applies)
5. Full verification: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`, then `pnpm check:package` and `pnpm check:consumer` (and `pnpm test:e2e` for user flows)

## Product documentation

Canonical docs: [`docs/README.md`](docs/README.md). Read the relevant page before changing search, cart, checkout, or host APIs.

| Topic | Doc |
|-------|-----|
| Widget install | [docs/GETTING-STARTED.md](docs/GETTING-STARTED.md) |
| Locales, env, facets, missions flags | [docs/CONFIGURATION.md](docs/CONFIGURATION.md) |
| LLM interpretation and Product Search | [docs/SEARCH-PIPELINE.md](docs/SEARCH-PIPELINE.md) |
| Cart, payments, orders | [docs/CART-AND-CHECKOUT.md](docs/CART-AND-CHECKOUT.md) |
| `CAT_DEBUG` / Langfuse | [docs/OBSERVABILITY.md](docs/OBSERVABILITY.md) |

Hard rules that still belong here: secrets never in the browser; widget modalities (`enableVoice`, `enableCameraSearch`, `enableImageSearch`) must not gate one another; `searchTerms` are catalog-language phrases, never split words; shopping missions cover text, voice, and image in React and Angular.

## Key config files

| File | Role |
|------|------|
| `turbo.json` | Monorepo task dependencies |
| `tsconfig.base.json` | Shared TypeScript options |
| `scripts/emit-package-dts.mjs` | Native `tsc` declaration emit: ESM tree in `dist/`, CommonJS tree in `dist/cjs/` (nested `package.json` `{"type":"commonjs"}`) for `core`, `server`, `react` |
| `scripts/print-commands.mjs` | Generates the Commands block in this file from root `package.json` scripts |
| `scripts/check-angular-apf.mjs` | Angular Package Format check, runs inside the `angular` build |
| `scripts/check-angular-consumer.mjs` | Packed-tarball consumer build for Angular 20.3 / 21.2 |
| `eslint.config.mjs` | Root ESLint flat config |
| `vitest.config.ts` | Root Vitest config: `evals/**/*.test.ts` and `scripts/*.test.ts` (packages have their own) |
| `.changeset/config.json` | Fixed release group (core, server, react, angular) |
| `.github/workflows/` | `ci.yml` (with the weekly Angular schedule), `release.yml` |
| `apps/demo-next/.env.example` | Required environment variables (React host) |
| `apps/demo-angular/.env.example` | Required environment variables (Angular host + Express BFF) |
| `docs/` | Canonical product documentation |
| `evals/` | Promptfoo LLM prompt evaluations (local only) |
| `.cursor/rules/` | Cursor agent rules (English only) |
