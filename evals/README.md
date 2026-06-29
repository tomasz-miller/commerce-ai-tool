# Promptfoo evaluations

Local [Promptfoo](https://www.promptfoo.dev/) harness for testing Commerce AI search prompts against real LLM calls.

## What is Promptfoo?

Promptfoo helps you practice **test-driven prompt engineering**:

1. Define test cases (user queries + expected behavior).
2. Run them through your prompts and model.
3. Check outputs with automatic **assertions** (JSON shape, locale rules, sort intent, etc.).
4. Review results in the terminal or web UI.

This complements Vitest unit tests in `packages/core`: Vitest tests parsers and builders **without** calling an LLM. Promptfoo tests **interpretation quality** (e.g. whether `"red shoes"` with a Norwegian catalog yields Norwegian `searchTerms`).

Promptfoo also supports **red teaming** (prompt injection, jailbreak probes). That is not set up yet; see the project ROADMAP for future phases.

## How this repo uses it

```
evals/tests/*.yaml  →  custom provider  →  createAIProvider (core)  →  OpenRouter
                              ↓
                        assertions on JSON output
```

The custom provider in `providers/text-search-provider.ts` calls the same `interpretTextQuery` path as production — no duplicated prompts.

## Prerequisites

- Node.js ≥ 24, pnpm 9.15.9
- OpenRouter API key
- Built `@commerce-ai-tool/core` (`pnpm build` — the `eval:promptfoo` script runs this automatically)

## One-time setup

From the repository root:

```bash
pnpm install
cp evals/.env.example evals/.env
# Edit evals/.env and set OPENROUTER_API_KEY
```

## Run evaluations

```bash
pnpm eval:promptfoo
```

The provider loads `evals/.env` when present. You can also export `OPENROUTER_API_KEY` in your shell.

### View results in the web UI

```bash
pnpm eval:promptfoo:view
```

Opens a matrix: rows are test cases, columns are providers. Click a failed cell to compare model output with assertions.

## Add a test case

Edit `tests/text-search.yaml`. Example:

```yaml
- description: English query translated to Norwegian catalog (blue jacket)
  vars:
    query: blue jacket
    queryLocale: en
    catalogLocale: no
  assert:
    - type: javascript
      value: |
        const terms = JSON.parse(output).searchTerms.join(' ').toLowerCase();
        return terms.includes('jakke') || terms.includes('blå');
```

Re-run `pnpm eval:promptfoo`.

### Assertion types used here

| Type | Purpose |
|------|---------|
| `is-json` | Output is valid JSON (in `defaultTest`) |
| `javascript` | Custom checks — parse output and validate `searchTerms`, `sort`, etc. |

Later phases may add `similar` (semantic match) or `llm-rubric` (grade with another model) for voice summaries.

## Change a prompt and catch regressions

1. Edit `packages/core/src/prompts/index.ts`.
2. Run `pnpm eval:promptfoo`.
3. Fix failures or update test expectations if behavior changed intentionally.

## Cache

Promptfoo caches LLM responses on disk (`.promptfoo/`). Re-running evals while tuning assertions is faster and cheaper.

Force fresh API calls:

```bash
promptfoo eval -c evals/promptfooconfig.yaml --no-cache
```

## Cost and CI

- Each test case triggers one OpenRouter request (~6 cases in the default suite).
- Evals are **local only** — they are not part of CI (API cost + API key required).
- CI still runs `pnpm test` (Vitest) for deterministic logic.

## File layout

```
evals/
  promptfooconfig.yaml       # Main Promptfoo config
  providers/
    text-search-provider.ts  # Bridges Promptfoo → @commerce-ai-tool/core
  tests/
    text-search.yaml         # Test cases and assertions
  .env.example               # Template for OPENROUTER_API_KEY
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `OPENROUTER_API_KEY is required` | Create `evals/.env` from `.env.example` |
| `Cannot find module '@commerce-ai-tool/core'` | Run `pnpm build` from repo root |
| Flaky locale assertions | LLM wording varies; use flexible checks (`includes` with alternatives) |
| All tests cached unexpectedly | Run with `--no-cache` |

## Learn more

- [Promptfoo docs](https://www.promptfoo.dev/docs/intro/)
- [Configuration guide](https://www.promptfoo.dev/docs/configuration/guide/)
- [Custom JavaScript providers](https://www.promptfoo.dev/docs/providers/custom-api/)
