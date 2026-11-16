# Development

Local workflow, quality gates, publishing, and hosting. Agent-specific toolchain notes (TypeScript 7 and the Angular exception, package map, test layout) and the full, generated command list stay in [`AGENTS.md`](../AGENTS.md#commands).

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
pnpm test          # Vitest unit tests
pnpm check:package # attw + publint on the built packages (after pnpm build)
pnpm check:consumer # packed core/server/react type-checked from a node16 CJS + ESM consumer (after pnpm build)
pnpm test:e2e      # Playwright, mocked backends (after pnpm build)
```

Copy `apps/demo-next/.env.example` to `apps/demo-next/.env.local` before `pnpm dev` or `pnpm dev:react`. For `pnpm dev:angular`, put secrets in `apps/demo-angular/.env` or `.env.local`; if `CTP_PROJECT_KEY` is still unset, the Express BFF reuses `apps/demo-next/.env.local` so you do not have to duplicate credentials. The Angular UI on `:4200` proxies `/api/commerce-ai` to the BFF on `127.0.0.1:3002` (see [Angular demo host](#angular-demo-host)).

Before finishing a feature (same order as CI):

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm check:package
pnpm check:consumer
pnpm test:e2e   # when the change touches a user flow (UI to API)
```

Promptfoo LLM evals are local-only (API cost). The suites, their scripts and the fixture generators are listed in [`evals/README.md`](../evals/README.md); the root `package.json` scripts are all listed in [`AGENTS.md`](../AGENTS.md#commands).

CI (`.github/workflows/ci.yml`) has three jobs: `ci` (`pnpm audit --prod`, `lint`, `typecheck`, `test`, `build`, `check:package`, `check:consumer`), `e2e` (`pnpm test:e2e`) and `angular-consumer` (a fresh Angular app built against the packed tarballs on Angular 20.3 and 21.2). `angular-consumer` also runs every Monday on a `schedule:` trigger, with the other two jobs skipped, so a new Angular patch release that breaks the library shows up outside pull requests. None of the jobs calls OpenRouter, Langfuse, Bedrock, or commercetools.

Dependabot pull requests that are minor or patch updates get auto-merge enabled (squash) by `.github/workflows/dependabot-auto-merge.yml`; GitHub merges them once the required checks pass. Major updates stay manual. The required checks (`ci`, `e2e`, `angular-consumer (20.3)`, `angular-consumer (21.2)`) and an admin bypass come from a repository ruleset, not from the workflow. The repository setting "Allow auto-merge" must be enabled. The "Version packages" PR is opened by `changesets/action` with `GITHUB_TOKEN`, so CI does not run on it; the repository admin merges it through the ruleset bypass. Auto-merge is enabled with `GITHUB_TOKEN`, and events caused by `GITHUB_TOKEN` do not start new workflow runs, so `ci.yml`, `release.yml` and the Bitbucket mirror (`mirror-to-bitbucket.yml`) do not run on `main` for these merges; they run again on the next push to `main`.

### End-to-end tests

`pnpm test:e2e` runs the Playwright suites of `apps/demo-next/e2e` (`next dev` on :3001) and `apps/demo-angular/e2e` (`ng serve` on :4201, see [Angular demo host](#angular-demo-host)). Every backend call is mocked in the specs with `page.route`, so no secrets are needed. Both demos consume the built `dist/` of the libraries, so run `pnpm build` first. The first run needs a browser: `pnpm --filter demo-next exec playwright install --with-deps chromium`. The `demo-next` specs open pages through `gotoHydrated` (`e2e/helpers.ts`), which waits for the `data-hydrated` attribute the demo sets on `<html>`, so a click never lands before React attaches its handlers. A change that touches a user flow (search, cart, checkout, orders, camera or voice overlays) needs a new or extended spec.

### Angular demo host

`apps/demo-angular` (Angular 21, standalone components + signals) mirrors `demo-next` page for page: search with cart and missions, product preview sheet, host-owned checkout wizard, and order confirmation/tracking.

- From the repo root: `pnpm dev:angular`. UI on `http://localhost:4200`, Express BFF on `127.0.0.1:3002` (loopback-only unless `BFF_HOST` is set). `proxy.conf.json` forwards `/api/commerce-ai` to `http://127.0.0.1:3002` (not `localhost`, which can resolve to IPv6 while the BFF binds IPv4). Package-local scripts: `pnpm --filter demo-angular dev:ui` / `dev:bff`. `dev:bff` runs `server/dev.ts`, which sets `NODE_ENV=development` so the BFF may use a random per-process cart session secret; `pnpm --filter demo-angular start` (the built BFF) does not, and needs `CAT_CART_SESSION_SECRET` (32+ bytes) in its environment or `.env.local`.
- The BFF loads `apps/demo-angular/.env`, then `.env.local`, then falls back to `apps/demo-next/.env.local` when `CTP_PROJECT_KEY` is still missing. It mounts every route via `createExpressRouter({ config, basePath: "/api/commerce-ai" })` (`server/`). The demo mock payment provider, which authorizes every payment, is injected only when `CAT_DEMO_MOCK_PAYMENTS=true` (set in `.env.example`); without it the payment routes answer as for a host with no provider.
- Checkout and orders have no Angular library components yet, so the host implements them against `CheckoutApiService` (`src/app/core/api/`), which mirrors the checkout subset of the React `useCart` hook; the step state machine lives in `CheckoutFacade` (`src/app/core/checkout/`).
- The widget comes from the built `packages/angular/dist` (Angular Package Format, partial compilation), the same artifact npm hosts install: `pnpm` links `dist` into the demo through `publishConfig.linkDirectory`, and there is no `tsconfig` path mapping. Run `pnpm build` (or `pnpm dev`, which watches the library) first. `angular.json` sets `preserveSymlinks: true` so the library's `@angular/*` and `rxjs` imports resolve from the demo's `node_modules` (Angular 21) instead of the library's own Angular 20.3 dev dependencies, which would put two Angular runtimes in the bundle. With that option the demo must depend directly on what the library and its dependencies import (`tslib`, `@commerce-ai-tool/core`).
- The library is compiled on Angular 20.3 (the oldest supported line) and declares peers `^20.3.0 || ^21.0.0 || ^22.0.0`; the demo runs Angular 21.2. Partial-compiled output is linked by the host's Angular version at build time, which is why a host cannot be older than the library's compile version. Angular 22 is not part of the CI matrix yet (it needs TypeScript 6, see AGENTS.md).
- The `development` build keeps `sourceMap: false`: `ng build --source-map` (all maps) fails with "File ... not found in TypeScript compilation". For local debugging, run `node_modules/.bin/ng serve --source-map=scripts` instead (proven to compile).
- The demo runs zoneless (`provideZonelessChangeDetection()` in `app.config.ts`, no `zone.js` polyfill). The widget components keep their state in signals and use `OnPush`, so the Playwright e2e suite exercises text, image and "added all" flows without zone.js. The library unit tests run zoneless as well (no `zone.js` import; `provideZonelessChangeDetection()` in every `TestBed`), so a change that needs a manual `detectChanges()` fails them.
- The demo's Playwright config (`apps/demo-angular/playwright.config.ts`) starts its own `ng serve` on port 4201 after `ng cache clean`, with `reuseExistingServer: false`. Angular's persistent build cache (`apps/demo-angular/.angular/cache`) can otherwise keep serving a previous build of the linked widget, and an old server on the port would be reused, so the suite would test an old widget. The consequence: port 4201 must be free (stop a leftover `ng serve` before `pnpm test:e2e`), and each run pays a cold build. To run against a server you started yourself, set `PLAYWRIGHT_BASE_URL`; then clearing the cache is your job.
- `angular.json` pins `cli.analytics: false`. Without it the CLI prompts for usage-data consent on the first `ng build` in an interactive shell, and under Turborepo that prompt is unanswerable — the build just hangs.
- Page chrome (light canvas, pill nav, hero, product sheet) lives in `src/styles.css` and matches `apps/demo-next/src/app/globals.css`.

### Shared widget styles

`packages/styles` (`@commerce-ai-tool/styles`, private) is the single source for `commerce-ai-search.css`. `@commerce-ai-tool/react` imports it and tsup inlines the CSS into its published `dist/index.css` (`./styles.css` export). `@commerce-ai-tool/angular` ships the same file unchanged: `ng-package.json` copies `commerce-ai-search.css` from the `@commerce-ai-tool/styles` workspace dependency into the package (ng-packagr only copies assets from inside the project root, hence the `node_modules` input), and its `./styles.css` export points at that file. Do not copy the stylesheet into the UI packages.

### Angular package build

`packages/angular` is built with ng-packagr (`ng-package.json`, `tsconfig.lib.json`, `tsconfig.lib.prod.json` with `compilationMode: "partial"`). `pnpm --filter @commerce-ai-tool/angular build` also runs `scripts/check-angular-apf.mjs` (partial declarations in `dist/fesm2022`, `ɵɵComponentDeclaration` in the typings, `ngAcceptInputType_messages` on the cart panel and mission results, export targets exist). The CI job `angular-consumer` runs `node scripts/check-angular-consumer.mjs --angular 20.3|21.2`, which packs core and angular, installs the tarballs with npm into a copy of `scripts/fixtures/angular-consumer` and runs `ng build` with strict templates (plus a negative control that must fail). Run it locally after `pnpm exec turbo run build --filter=@commerce-ai-tool/angular`.

## Contributing

1. Fork and clone; create a feature branch from `main`
2. Keep changes focused and minimal
3. English only in source, tests, docs, and public APIs
4. Update documentation in this folder when behavior or APIs change
5. Add a changeset (`pnpm changeset`) for a user-visible change to a published package
6. Ensure CI passes

Use GitHub Issues with a clear description, steps to reproduce, and environment details.

Do **not** file security vulnerabilities as public issues. Follow [SECURITY.md](../.github/SECURITY.md).

## Publishing to npm

Four scoped packages are published: `@commerce-ai-tool/core`, `@commerce-ai-tool/server`, `@commerce-ai-tool/react`, and `@commerce-ai-tool/angular`. **The demo apps (`demo-next`, `demo-angular`) are private and are never published.** Versions are linked as a **fixed** Changesets group so they stay in lockstep.

### One-time npm org

Scoped packages require an npm organization whose name matches the scope (`commerce-ai-tool`). Create it on npmjs.com if it does not exist yet. Do not store a long-lived `NPM_TOKEN` in GitHub.

### Trusted Publisher

Each package page on npmjs.com (`core`, `server`, `react`, `angular`) must have a **Trusted Publisher** with these values:

- GitHub user: `tomasz-miller`
- Repository: `commerce-ai-tool`
- Workflow filename: `release.yml`
- Allowed action: `npm publish`

Releases run on push to `main` via [`.github/workflows/release.yml`](../.github/workflows/release.yml) (GitHub OIDC, no `NPM_TOKEN`, npm provenance). The workflow first reuses `ci.yml` as its `verify` job and publishes only if that passes. OIDC cannot create the first version of a package that does not exist yet, so a new package name needs one local publish by the maintainer before its Trusted Publisher can be added.

### How to publish

Publish only through the Changesets release (`pnpm exec changeset publish`, which runs `pnpm publish` per package), or `pnpm publish` run from a package root. Never run `npm publish` inside `packages/angular/dist`. `@commerce-ai-tool/angular` is published from its build output: its `publishConfig.directory` is `dist`, so `pnpm publish` run from `packages/angular` packs `dist/` and rewrites the `workspace:*` range for `@commerce-ai-tool/core` in that manifest. `npm publish` inside `dist` would skip that rewrite and ship an uninstallable `workspace:` dependency. `pnpm check:package` and the `angular-consumer` job check the packed output.

If CI fails with `TypeError: Cannot read properties of undefined (reading 'includes')` inside `isAlreadyPublishedError`, that is a `@changesets/cli` 2.x + pnpm bug masking the real registry error. The release workflow uses Changesets 3, npm 11.x, and deliberately omits `actions/setup-node`'s `registry-url` option so it does not inject a placeholder `NODE_AUTH_TOKEN` that prevents OIDC authentication.

### Ongoing releases

1. On a feature PR, add a changeset: `pnpm changeset`
2. Merge to `main` — the Release workflow opens a **Version packages** PR
3. Merge that PR — the workflow publishes and tags

```bash
pnpm changeset          # describe changes
pnpm version-packages   # used by the Version packages PR
```

## Hosting

GitHub is the source of truth and public portfolio. Columbus keeps a private copy on Bitbucket; push day-to-day work to GitHub (`origin`). CI runs on GitHub Actions and, on `main`, as Bitbucket Pipelines (enable Pipelines on the Bitbucket repository).

| | GitHub | Bitbucket |
|--|--|--|
| This repo | [tomasz-miller/commerce-ai-tool](https://github.com/tomasz-miller/commerce-ai-tool) | [istonecrosscommerce/commerce-ai-tool](https://bitbucket.org/istonecrosscommerce/commerce-ai-tool) |
| zero-to-ct-storefront | [GitHub](https://github.com/tomasz-miller/zero-to-ct-storefront) | [Bitbucket](https://bitbucket.org/istonecrosscommerce/zero-to-ct-storefront) |
| ct-agentic-connect | [GitHub](https://github.com/tomasz-miller/ct-agentic-connect) | [Bitbucket](https://bitbucket.org/istonecrosscommerce/ct-agentic-connect) |
| commercetools-agentic-playbook | [GitHub](https://github.com/tomasz-miller/commercetools-agentic-playbook) | [Bitbucket](https://bitbucket.org/istonecrosscommerce/commercetools-agentic-playbook) |
