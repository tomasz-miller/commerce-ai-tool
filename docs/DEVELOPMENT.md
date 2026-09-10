# Development

Local workflow, quality gates, publishing, and hosting. Agent-specific toolchain notes (TypeScript 7, test layout) stay in [`AGENTS.md`](../AGENTS.md).

[Documentation index](README.md)

## Commands

```bash
pnpm install
pnpm build
pnpm dev      # demo-next on http://localhost:3000 + library watch
pnpm lint
pnpm typecheck
pnpm test     # Vitest
```

Copy `apps/demo-next/.env.example` to `apps/demo-next/.env.local` before `pnpm dev`. Local development uses the React host only; an Angular demo app is planned in [ROADMAP](ROADMAP.md).

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

## Contributing

1. Fork and clone; create a feature branch from `main`
2. Keep changes focused and minimal
3. English only in source, tests, docs, and public APIs
4. Update documentation in this folder when behavior or APIs change
5. Ensure CI passes

Use GitHub Issues with a clear description, steps to reproduce, and environment details.

Do **not** file security vulnerabilities as public issues. Follow [SECURITY.md](../.github/SECURITY.md).

## Publishing to npm

Four scoped packages are published: `@commerce-ai-tool/core`, `@commerce-ai-tool/server`, `@commerce-ai-tool/react`, and `@commerce-ai-tool/angular`. **`demo-next` is private and is never published.** Versions are linked as a **fixed** Changesets group so they stay in lockstep.

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

After that, restore `on.push.branches: [main]` in [`.github/workflows/release.yml`](../.github/workflows/release.yml). Later releases use GitHub OIDC (no `NPM_TOKEN`) and npm provenance.

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
