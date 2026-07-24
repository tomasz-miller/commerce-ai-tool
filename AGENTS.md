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
| Commerce | `@commercetools/platform-sdk`, `@commercetools/sdk-client-v2` |
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
pnpm eval:promptfoo:redteam
pnpm eval:promptfoo:redteam:generate
pnpm eval:promptfoo:view  # Promptfoo results web UI
pnpm eval:fixtures:audio
pnpm eval:fixtures:images
```

Before finishing a feature, run **all of the above** (same order as CI), except prompt evals which are optional and local-only.

## Prompt evaluations (Promptfoo)

Local LLM regression tests live in [`evals/`](evals/). They call the same `createAIProvider` paths as production (text, image, voice enhance/TTS, redteam).

- **Setup:** `cp evals/.env.example evals/.env` and set `OPENROUTER_API_KEY`
- **Run:** `pnpm eval:promptfoo` and suite-specific `pnpm eval:promptfoo:*` scripts (see [`evals/README.md`](evals/README.md))
- **Bedrock matrix:** text, image, and voice baseline configs include optional Bedrock columns (`skipIfUnavailable: true` — skipped when `AWS_REGION` is unset)
- **Optional CI:** GitHub Actions workflow `evals-promptfoo.yml` (manual dispatch; secrets: `OPENROUTER_API_KEY`, optional `REDTEAM_PROVIDER_API_KEY`)
- **Not in default CI** — requires API key and incurs LLM cost

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
- Unused variables: `_` prefix or remove import (ESLint rule)
- Public API changes → update README / CHANGELOG / changeset

## CI (GitHub Actions)

Workflow `.github/workflows/ci.yml` on every PR/push to `main`:

`lint` → `typecheck` → `test` → `build`

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
- Autocomplete: CT Search Term Suggestions on `searchKeywords` first; if empty and the query is cross-locale or multi-word NL, AI proposes catalog-language suggestion phrases (`suggestSearchTerms`).
- Resolver: `packages/core/src/locale/resolve.ts` (`resolveSearchLocales`).
- Dev tracing: `logSearchTrace` in `packages/core/src/utils/dev-trace.ts` (enabled when `NODE_ENV !== production` or `CAT_DEBUG=true`).
- Langfuse (opt-in): set `LANGFUSE_PUBLIC_KEY` + `LANGFUSE_SECRET_KEY`; core wraps AI + commercetools spans under the HTTP request span; autocomplete suggestions are not traced unless `LANGFUSE_TRACE_SUGGESTIONS=true`. Host registers `LangfuseSpanProcessor` (see `apps/demo-next/src/instrumentation.ts` and `@commerce-ai-tool/server/flush`). Complements `CAT_DEBUG`; see README “Langfuse (AI observability)”. Optional managed system prompts: `LANGFUSE_PROMPTS=true` or `CommerceAIConfig.langfuse.promptsEnabled` (applied by `createSearchOrchestrator` via `configureLangfusePrompts`) + `pnpm sync:langfuse-prompts` (default label `staging`; promote with `--label production` after evals). Git catalog remains source of truth / eval fallback (`createEvalAIProvider` forces local prompts).

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
