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

Copy `apps/demo-next/.env.example` to `apps/demo-next/.env.local` before `pnpm dev`.

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
pnpm eval:promptfoo:redteam
pnpm eval:promptfoo:redteam:generate
pnpm eval:promptfoo:view
pnpm eval:fixtures:audio
pnpm eval:fixtures:images
```

CI (`.github/workflows/ci.yml`) runs `lint` → `typecheck` → `test` → `build`. It does not call OpenRouter, Langfuse, Bedrock, or commercetools.

## Contributing

1. Fork and clone; create a feature branch from `main`
2. Keep changes focused and minimal
3. English only in source, tests, docs, and public APIs
4. Update documentation in this folder when behavior or APIs change
5. Ensure CI passes

Use GitHub Issues with a clear description, steps to reproduce, and environment details.

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

Current release workflow (`.github/workflows/release.yml`) publishes automatically on merge to `main` when changesets are present. Until npm is configured, treat that workflow as `workflow_dispatch` only.

## Hosting

GitHub is the source of truth and public portfolio. Columbus keeps a private copy on Bitbucket; push day-to-day work to GitHub (`origin`). CI runs on GitHub Actions and, on `main`, as Bitbucket Pipelines (enable Pipelines on the Bitbucket repository).

| | GitHub | Bitbucket |
|--|--|--|
| This repo | [tomasz-miller/commerce-ai-tool](https://github.com/tomasz-miller/commerce-ai-tool) | [istonecrosscommerce/commerce-ai-tool](https://bitbucket.org/istonecrosscommerce/commerce-ai-tool) |
| zero-to-ct-storefront | [GitHub](https://github.com/tomasz-miller/zero-to-ct-storefront) | [Bitbucket](https://bitbucket.org/istonecrosscommerce/zero-to-ct-storefront) |
| ct-agentic-connect | [GitHub](https://github.com/tomasz-miller/ct-agentic-connect) | [Bitbucket](https://bitbucket.org/istonecrosscommerce/ct-agentic-connect) |
| commercetools-agentic-playbook | [GitHub](https://github.com/tomasz-miller/commercetools-agentic-playbook) | [Bitbucket](https://bitbucket.org/istonecrosscommerce/commercetools-agentic-playbook) |
