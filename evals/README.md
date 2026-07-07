# Promptfoo evaluations

Local [Promptfoo](https://www.promptfoo.dev/) harness for testing Commerce AI search prompts against real LLM calls.

## What is Promptfoo?

Promptfoo helps you practice **test-driven prompt engineering**:

1. Define test cases (user queries + expected behavior).
2. Run them through your prompts and model.
3. Check outputs with automatic **assertions** (JSON shape, locale rules, sort intent, etc.).
4. Review results in the terminal or web UI.

This complements Vitest unit tests in `packages/core`: Vitest tests parsers and builders **without** calling an LLM. Promptfoo tests **interpretation quality** (e.g. whether `"red shoes"` with a Norwegian catalog yields Norwegian `searchTerms`).

## How this repo uses it

```
evals/tests/*.yaml  →  custom provider  →  createEvalAIProvider  →  OpenRouter / Bedrock
                              ↓
                        assertions on output
```

Custom providers call the same `createAIProvider` paths as production — no duplicated prompts.

## Prerequisites

- Node.js ≥ 24, pnpm 9.15.9
- OpenRouter API key (required for all suites)
- Optional: AWS credentials + `AWS_REGION` for Bedrock matrix columns (omitted from the eval matrix when unset)
- Built `@commerce-ai-tool/core` (`pnpm build` — eval scripts run this automatically)

## One-time setup

From the repository root:

```bash
pnpm install
cp evals/.env.example evals/.env
# Edit evals/.env and set OPENROUTER_API_KEY
```

Optional Bedrock comparison (local):

```bash
# In evals/.env
AWS_REGION=eu-west-1
BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0
BEDROCK_VISION_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0
```

## Run evaluations

| Command | Config | What it tests |
|---------|--------|---------------|
| `pnpm eval:promptfoo` | `promptfooconfig.ts` | Text search (`interpretTextQuery`) — OpenRouter + Bedrock when `AWS_REGION` is set |
| `pnpm eval:promptfoo:voice` | `promptfooconfig.voice.ts` | Voice baselines + audio models + Bedrock enhance baseline when AWS is configured |
| `pnpm eval:promptfoo:image` | `promptfooconfig.image.ts` | Image search (`interpretImageQuery`) — OpenRouter + Bedrock when `AWS_REGION` is set |
| `pnpm eval:promptfoo:voice-enhance` | `promptfooconfig.voice-enhance.yaml` | Transcript cleanup (`enhanceVoiceTranscript`) |
| `pnpm eval:promptfoo:voice-tts` | `promptfooconfig.voice-tts.yaml` | Result summaries (`summarizeVoiceResults`) |
| `pnpm eval:promptfoo:redteam` | `promptfooconfig.redteam.yaml` | Prompt injection + jailbreak probes on text search |
| `pnpm eval:promptfoo:view` | — | Web UI matrix |

Fixture regeneration:

```bash
pnpm eval:fixtures:audio    # macOS only — WAV voice clips
pnpm eval:fixtures:images   # Resize/compress JPEG vision fixtures
```

### OpenRouter vs Bedrock matrix

Text and image configs include side-by-side columns:

| Label | Backend | Notes |
|-------|---------|-------|
| `openrouter-gemini-31-lite` | OpenRouter | Always included |
| `bedrock-claude-35-sonnet` | AWS Bedrock | Included only when `AWS_REGION` is set — no Bedrock cells run otherwise |

Voice config adds `baseline-enhance-bedrock` (enhance → interpret on transcript) under the same rule. Audio columns remain OpenRouter-only (`interpretVoiceAudio` is not supported on Bedrock).

Configs are TypeScript (`promptfooconfig.ts`, `.image.ts`, `.voice.ts`) so Bedrock provider columns are omitted at load time when AWS is unavailable — not skipped at runtime.

Compare pass rates in the matrix UI:

```bash
pnpm eval:promptfoo:view
```

### Voice enhance + TTS evals

```bash
pnpm eval:promptfoo:voice-enhance
pnpm eval:promptfoo:voice-tts
```

- **Enhance** uses `similar` + `javascript` (filler-word removal, semantic match).
- **TTS** uses `llm-rubric` + `javascript` (result count, locale, top product name).

### Image search evals

```bash
pnpm eval:fixtures:images
pnpm eval:promptfoo:image
```

Uses `OPENROUTER_VISION_MODEL` (default: `google/gemini-3.1-flash-lite-preview`). Fixtures: [`fixtures/images/`](fixtures/images/).

### Red teaming

```bash
pnpm eval:promptfoo:redteam
pnpm eval:promptfoo:redteam:generate   # regenerate attack probes (less frequent)
```

Targets `text-search-provider` with built-in plugins `hijacking` and `system-prompt-override`, plus `jailbreak` strategy. Promptfoo may ask for **email verification** on first run (remote attack generation). Optional `REDTEAM_PROVIDER_API_KEY` in `evals/.env` (see `.env.example`).

## GitHub Actions (manual)

Workflow [`.github/workflows/evals-promptfoo.yml`](../.github/workflows/evals-promptfoo.yml) runs on **workflow_dispatch** only (not on every PR).

1. Add repository secret **`OPENROUTER_API_KEY`** (Settings → Secrets and variables → Actions).
2. Optional: **`REDTEAM_PROVIDER_API_KEY`** for redteam attack generation.
3. Actions → **Promptfoo evals** → choose suite (`text` default; `all` and `redteam` cost more).

Bedrock is **not** used in CI (no AWS secrets). Uploads `.promptfoo/` as an artifact.

## Assertion types

| Type | Purpose |
|------|---------|
| `javascript` | Custom checks — JSON shape, locale terms |
| `similar` | Semantic match for plain-text enhance output |
| `llm-rubric` | Grade TTS summaries and redteam responses with another model |

## Change a prompt and catch regressions

1. Edit prompts in `packages/core/src/prompts/` or voice helpers in `packages/core/src/search/`.
2. Run the relevant `pnpm eval:promptfoo:*` command.
3. Fix failures or update test expectations if behavior changed intentionally.

## Cache

Promptfoo caches LLM responses on disk (`.promptfoo/`). Force fresh API calls:

```bash
promptfoo eval -c evals/promptfooconfig.ts --no-cache
```

## Cost

- Each test case × provider column triggers LLM calls (OpenRouter; Bedrock when configured).
- Redteam and `all` suites are the most expensive.
- Main CI (`ci.yml`) does **not** run Promptfoo — only Vitest + build.

## File layout

```
evals/
  promptfooconfig.ts                # Text search (OR + Bedrock when AWS configured)
  promptfooconfig.voice.ts          # Voice baselines + audio
  promptfooconfig.image.ts          # Image search (OR + Bedrock when AWS configured)
  config/                           # TS config builders + Bedrock gating
  promptfooconfig.voice-enhance.yaml
  promptfooconfig.voice-tts.yaml
  promptfooconfig.redteam.yaml
  providers/
    eval-utils.ts                   # createEvalAIProvider, fixtures, skip helpers
    eval-utils.test.ts
    text-search-provider.ts
    image-search-provider.ts
    voice-baseline-provider.ts
    voice-audio-provider.ts
    voice-enhance-provider.ts
    voice-tts-provider.ts
  tests/
    text-search.yaml
    voice-search.yaml
    image-search.yaml
    voice-enhance.yaml
    voice-tts.yaml
  fixtures/
    audio/
    images/
  scripts/
    generate-audio-fixtures.sh
    compress-image-fixtures.sh
  redteam/
    purpose.txt
  .env.example
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `OPENROUTER_API_KEY is required` | Create `evals/.env` from `.env.example` |
| No Bedrock column in matrix | Expected without `AWS_REGION`; set it in `evals/.env` to compare Bedrock |
| `Cannot find module '@commerce-ai-tool/core'` | Run `pnpm build` from repo root |
| Flaky locale assertions | LLM wording varies; use flexible `includes` checks |
| All tests cached unexpectedly | Run with `--no-cache` |
| Missing image fixture | Run `pnpm eval:fixtures:images` |

## Learn more

- [Promptfoo docs](https://www.promptfoo.dev/docs/intro/)
- [Red teaming](https://www.promptfoo.dev/docs/red-team/)
- [Custom JavaScript providers](https://www.promptfoo.dev/docs/providers/custom-api/)
