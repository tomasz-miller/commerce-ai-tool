# Development

Local workflow, quality gates, publishing, and hosting. Agent-specific toolchain notes (TypeScript 7, test layout) stay in [`AGENTS.md`](../AGENTS.md).

[Documentation index](README.md)

## Commands

```bash
pnpm install
pnpm build
pnpm dev           # demo-next on http://localhost:3000 + demo-angular UI on :4200/BFF on :3002 + library watch
pnpm dev:react     # React/Next host only (:3000)
pnpm dev:angular   # Angular host only (:4200 + Express BFF on :3002)
pnpm lint
pnpm typecheck
pnpm test     # Vitest
```

Copy `apps/demo-next/.env.example` to `apps/demo-next/.env.local` before `pnpm dev` or `pnpm dev:react`. For `pnpm dev:angular`, put secrets in `apps/demo-angular/.env` or `.env.local`; if `CTP_PROJECT_KEY` is still unset, the Express BFF reuses `apps/demo-next/.env.local` so you do not have to duplicate credentials. The Angular UI on `:4200` proxies `/api/commerce-ai` to the BFF on `127.0.0.1:3002` (see [Angular demo host](#angular-demo-host)).

Before finishing a feature (same order as CI):

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Promptfoo LLM evals are local-only (API cost). See [`evals/README.md`](../evals/README.md).

```bash
pnpm eval:promptfoo
pnpm eval:promptfoo:voice
pnpm eval:promptfoo:image
pnpm eval:promptfoo:voice-enhance
pnpm eval:promptfoo:voice-tts
pnpm eval:promptfoo:mission
pnpm eval:promptfoo:suggest
pnpm eval:promptfoo:refine
pnpm eval:promptfoo:retrieval
pnpm eval:models
pnpm eval:promptfoo:redteam
pnpm eval:promptfoo:redteam:generate
pnpm eval:promptfoo:view
pnpm eval:fixtures:audio
pnpm eval:fixtures:images
pnpm eval:fixtures:catalog
```

CI (`.github/workflows/ci.yml`) runs `lint` → `typecheck` → `test` → `build`. It does not call OpenRouter, Langfuse, Bedrock, or commercetools.

### Angular demo host

`apps/demo-angular` (Angular 20, standalone components + signals) mirrors `demo-next` page for page: search with cart and missions, product preview sheet, host-owned checkout wizard, and order confirmation/tracking.

- From the repo root: `pnpm dev:angular`. UI on `http://localhost:4200`, Express BFF on `127.0.0.1:3002` (loopback-only unless `BFF_HOST` is set). `proxy.conf.json` forwards `/api/commerce-ai` to `http://127.0.0.1:3002` (not `localhost`, which can resolve to IPv6 while the BFF binds IPv4). Package-local scripts: `pnpm --filter demo-angular dev:ui` / `dev:bff`.
- The BFF loads `apps/demo-angular/.env`, then `.env.local`, then falls back to `apps/demo-next/.env.local` when `CTP_PROJECT_KEY` is still missing. It mounts every route via `createExpressRouter({ config, basePath: "/api/commerce-ai" })` with the demo mock payment provider (`server/`).
- Checkout and orders have no Angular library components yet, so the host implements them against `CheckoutApiService` (`src/app/core/api/`), which mirrors the checkout subset of the React `useCart` hook; the step state machine lives in `CheckoutFacade` (`src/app/core/checkout/`).
- The widget is compiled from `packages/angular` sources via a `tsconfig` path mapping because the published tsup bundle carries no Angular compiler metadata. Keep the mapping in sync with the library entry point if files move. The host also depends on `@commerce-ai-tool/styles` so Vite can resolve the shared widget stylesheet from those sources.
- The `development` build keeps `sourceMap: false`: enabling style/vendor maps breaks the Angular 20.3 compiler program for path-mapped sources outside the project root. For local debugging, run `node_modules/.bin/ng serve --source-map=scripts` instead (proven to compile).
- `angular.json` pins `cli.analytics: false`. Without it the CLI prompts for usage-data consent on the first `ng build` in an interactive shell, and under Turborepo that prompt is unanswerable — the build just hangs.
- Page chrome (light canvas, pill nav, hero, product sheet) lives in `src/styles.css` and matches `apps/demo-next/src/app/globals.css`.

### Shared widget styles

`packages/styles` (`@commerce-ai-tool/styles`, private) is the single source for `commerce-ai-search.css`. `@commerce-ai-tool/react` and `@commerce-ai-tool/angular` import it; tsup inlines the CSS into each published `dist/index.css` (`./styles.css` export). Do not copy the stylesheet into the UI packages.

## Contributing

1. Fork and clone; create a feature branch from `main`
2. Keep changes focused and minimal
3. English only in source, tests, docs, and public APIs
4. Update documentation in this folder when behavior or APIs change
5. Ensure CI passes

Use GitHub Issues with a clear description, steps to reproduce, and environment details.

Do **not** file security vulnerabilities as public issues. Follow [SECURITY.md](../.github/SECURITY.md).

## Publishing to npm

Four scoped packages are published: `@commerce-ai-tool/core`, `@commerce-ai-tool/server`, `@commerce-ai-tool/react`, and `@commerce-ai-tool/angular`. **The demo apps (`demo-next`, `demo-angular`) are private and are never published.** Versions are linked as a **fixed** Changesets group so they stay in lockstep.

### One-time npm org

Scoped packages require an npm organization whose name matches the scope (`commerce-ai-tool`). Create it on npmjs.com if it does not exist yet. Do not store a long-lived `NPM_TOKEN` in GitHub.

### First publish (`2.4.0`) — after merge to `main`

OIDC trusted publishing cannot create a package’s first version. From an up-to-date `main` (not a feature branch):

```bash
npm login
pnpm build
pnpm exec changeset publish
```

Then on each package page (`core`, `server`, `react`, `angular`) add a **Trusted Publisher**:

- GitHub user: `tomasz-miller`
- Repository: `commerce-ai-tool`
- Workflow filename: `release.yml`
- Allowed action: `npm publish`

Later releases run on push to `main` via [`.github/workflows/release.yml`](.github/workflows/release.yml) (GitHub OIDC, no `NPM_TOKEN`, npm provenance). The first `2.4.0` publish is still local: OIDC cannot create a package that does not exist yet.

If CI fails with `TypeError: Cannot read properties of undefined (reading 'includes')` inside `isAlreadyPublishedError`, that is a `@changesets/cli` 2.x + pnpm bug masking the real registry error. The release workflow uses Changesets 3, npm 11.x, and deliberately omits `actions/setup-node`'s `registry-url` option so it does not inject a placeholder `NODE_AUTH_TOKEN` that prevents OIDC authentication.

### Ongoing releases

1. On a feature PR, add a changeset: `pnpm changeset`
2. Merge to `main` — the Release workflow opens a **Version packages** PR
3. Merge that PR — the workflow publishes and tags

```bash
pnpm changeset          # describe changes
pnpm version-packages   # used by the Version packages PR, not for the first 2.4.0 bootstrap
```

## Hosting

GitHub is the source of truth and public portfolio. Columbus keeps a private copy on Bitbucket; push day-to-day work to GitHub (`origin`). CI runs on GitHub Actions and, on `main`, as Bitbucket Pipelines (enable Pipelines on the Bitbucket repository).

| | GitHub | Bitbucket |
|--|--|--|
| This repo | [tomasz-miller/commerce-ai-tool](https://github.com/tomasz-miller/commerce-ai-tool) | [istonecrosscommerce/commerce-ai-tool](https://bitbucket.org/istonecrosscommerce/commerce-ai-tool) |
| zero-to-ct-storefront | [GitHub](https://github.com/tomasz-miller/zero-to-ct-storefront) | [Bitbucket](https://bitbucket.org/istonecrosscommerce/zero-to-ct-storefront) |
| ct-agentic-connect | [GitHub](https://github.com/tomasz-miller/ct-agentic-connect) | [Bitbucket](https://bitbucket.org/istonecrosscommerce/ct-agentic-connect) |
| commercetools-agentic-playbook | [GitHub](https://github.com/tomasz-miller/commercetools-agentic-playbook) | [Bitbucket](https://bitbucket.org/istonecrosscommerce/commercetools-agentic-playbook) |
