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

### Voice search evals (audio + model matrix)

Compare transcript baselines against direct audio interpretation (`interpretVoiceAudio`):

```bash
pnpm eval:fixtures:audio   # macOS only — regenerate WAV clips
pnpm eval:promptfoo:voice
```

Providers in [`promptfooconfig.voice.yaml`](promptfooconfig.voice.yaml):

| Label | Path |
|-------|------|
| `baseline-text-gemini-31-lite` | canonical `transcript` → `interpretTextQuery` (`gemini-3.1-flash-lite-preview`) |
| `baseline-enhance-gemini-31-lite` | `transcript` → enhance → interpret (current production chain) |
| `gemini-25-flash-audio` | WAV fixture → `google/gemini-2.5-flash` + `input_audio` |
| `gemini-31-flash-lite-audio` | WAV fixture → `google/gemini-3.1-flash-lite-preview` + `input_audio` |

Use the matrix UI to compare pass rates before switching the production voice path:

```bash
pnpm eval:promptfoo:view
```

Force fresh API calls:

```bash
promptfoo eval -c evals/promptfooconfig.voice.yaml --no-cache
```

### Image search evals (vision)

Regression tests for `interpretImageQuery` on compressed JPEG fixtures:

```bash
pnpm eval:fixtures:images   # resize/compress fixtures (macOS sips or ffmpeg)
pnpm eval:promptfoo:image
```

Provider in [`promptfooconfig.image.yaml`](promptfooconfig.image.yaml) uses `OPENROUTER_VISION_MODEL` (default: `google/gemini-3.1-flash-lite-preview`). Fixtures live in [`fixtures/images/`](fixtures/images/) — see README there for scenarios and size targets.

Force fresh API calls:

```bash
promptfoo eval -c evals/promptfooconfig.image.yaml --no-cache
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
  promptfooconfig.yaml           # Text search evals
  promptfooconfig.voice.yaml     # Voice audio + baseline matrix
  promptfooconfig.image.yaml     # Image search vision evals
  providers/
    eval-utils.ts                # Shared env + fixture helpers
    eval-utils.test.ts           # Deterministic fixture helper tests
    text-search-provider.ts      # Bridges Promptfoo → interpretTextQuery
    image-search-provider.ts     # Image fixture → interpretImageQuery
    voice-baseline-provider.ts   # Transcript baseline providers
    voice-audio-provider.ts      # Audio fixture → interpretVoiceAudio
  tests/
    text-search.yaml             # Text search cases
    voice-search.yaml            # Voice cases (transcript + audioFile)
    image-search.yaml            # Image cases (imageFile)
  fixtures/
    audio/                       # WAV clips (see README inside)
    images/                      # JPEG clips (see README inside)
  scripts/
    generate-audio-fixtures.sh   # macOS TTS fixture generator
    compress-image-fixtures.sh   # Resize/compress image fixtures
  .env.example                   # Template for OPENROUTER_API_KEY
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `OPENROUTER_API_KEY is required` | Create `evals/.env` from `.env.example` |
| `Cannot find module '@commerce-ai-tool/core'` | Run `pnpm build` from repo root |
| Flaky locale assertions | LLM wording varies; use flexible checks (`includes` with alternatives) |
| All tests cached unexpectedly | Run with `--no-cache` |
| `Cannot find module ... eval-utils.js` | Eval providers import sibling `.ts` files with a `.ts` extension (Promptfoo loads TS directly) |

## Learn more

- [Promptfoo docs](https://www.promptfoo.dev/docs/intro/)
- [Configuration guide](https://www.promptfoo.dev/docs/configuration/guide/)
- [Custom JavaScript providers](https://www.promptfoo.dev/docs/providers/custom-api/)
