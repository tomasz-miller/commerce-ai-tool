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
| `demo-next` | `apps/demo-next` | Demo app (Next.js 15) |

Package dependencies: `server`, `react`, `angular` → `core`.

## Environment requirements

- **Node.js** ≥ 24 (CI: 24)
- **pnpm** 9.15.9 (`packageManager` in root `package.json` — do not override version in workflows)
- **Turbo** 2.x — task orchestration

## Tech stack

| Layer | Libraries |
|-------|-----------|
| Language / build | TypeScript 5.8 (strict), tsup 8, ESM + CJS |
| Monorepo | pnpm workspaces, Turborepo |
| Unit tests | Vitest 3 (`packages/**/*.test.ts`) |
| Lint | ESLint 9 + typescript-eslint |
| AI | `@openrouter/sdk`, `@aws-sdk/client-bedrock-runtime` |
| Commerce | `@commercetools/platform-sdk`, `@commercetools/sdk-client-v2` |
| Voice | `@elevenlabs/elevenlabs-js` (server) |
| React UI | React ≥ 18, lucide-react |
| Angular UI | Angular ≥ 17, RxJS ≥ 7 |
| Demo | Next.js 15, React 19 |

Add new dependencies in the **specific package** `package.json`, not root (except shared dev tools).

## Commands

```bash
pnpm install              # install
pnpm build                # build all packages
pnpm dev                  # dev (demo-next :3000 + library watch)
pnpm lint                 # ESLint
pnpm typecheck            # tsc --noEmit
pnpm test                 # Vitest
```

Before finishing a feature, run **all of the above** (same order as CI).

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

## Key config files

| File | Role |
|------|------|
| `turbo.json` | Monorepo task dependencies |
| `tsconfig.base.json` | Shared TypeScript options |
| `eslint.config.mjs` | Root ESLint flat config |
| `vitest.config.ts` | `packages/**/*.test.ts` pattern |
| `apps/demo-next/.env.example` | Required environment variables |
| `.cursor/rules/` | Cursor agent rules (English only) |
