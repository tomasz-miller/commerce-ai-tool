# Roadmap

## v1.0 (current)

- [x] Product search via commercetools Product Search API
- [x] AI query interpretation (OpenRouter / AWS Bedrock)
- [x] Voice search (ElevenLabs STT + TTS)
- [x] Image search (vision AI)
- [x] Glass morphism UI with light / dark / auto theme
- [x] React, Next.js, and Angular packages
- [x] Server package (Express + Next.js handlers)
- [x] Promptfoo LLM evals for text search interpretation ([`evals/`](evals/))

## v1.1

- [x] Autocomplete via commercetools Search Term Suggestions (`searchKeywords`)
- [x] AI suggestion fallback when CT Suggest is empty for cross-locale or multi-word NL queries (`suggestSearchTerms`)
- [x] AI-suggested faceted search filters in UI
- [x] Internationalization (i18n) for widget labels (runtime `messages` overrides)
- [x] Short-lived response cache on server (opt-in via `CAT_CACHE_*`)

## Prompt evaluations (Promptfoo)

Local [Promptfoo](https://www.promptfoo.dev/) regression tests for AI prompts. Complements Vitest (deterministic parsers) and future Langfuse (production traces + datasets).

### Done (phase 1)

- [x] `evals/` harness with custom provider → `createAIProvider` → `interpretTextQuery`
- [x] Text search test cases: locale translation, sort intent, non-commerce edge cases
- [x] Scripts: `pnpm eval:promptfoo`, `pnpm eval:promptfoo:view`
- [x] English docs: [`evals/README.md`](evals/README.md)

### Done (voice evals — phase 0a)

- [x] Voice Promptfoo config: `evals/promptfooconfig.voice.ts`
- [x] Providers: transcript baseline + `interpretVoiceAudio` on WAV fixtures
- [x] Model matrix: `gemini-2.0-flash-001` baseline vs `gemini-2.5-flash` / `gemini-2.0-flash-001` audio
- [x] Script: `pnpm eval:promptfoo:voice`, `pnpm eval:fixtures:audio`
- [x] Five committed WAV fixtures under `evals/fixtures/audio/`

### Done (voice enhance + TTS — phase 1)

- [x] Voice enhance evals: `evals/promptfooconfig.voice-enhance.yaml` → `enhanceVoiceTranscript` only
- [x] Voice TTS summary evals: `evals/promptfooconfig.voice-tts.yaml` → `summarizeVoiceResults` only
- [x] Assertions: `similar` + `javascript` (enhance); `llm-rubric` + `javascript` (TTS)
- [x] Scripts: `pnpm eval:promptfoo:voice-enhance`, `pnpm eval:promptfoo:voice-tts`

### Done (image search — phase 2)

- [x] Compressed JPEG fixtures under `evals/fixtures/images/` (`pnpm eval:fixtures:images`)
- [x] Image search evals: `evals/promptfooconfig.image.yaml` → `interpretImageQuery`
- [x] Script: `pnpm eval:promptfoo:image`

### Done (OpenRouter vs Bedrock matrix — phase 3)

- [x] Shared `createEvalAIProvider()` in `evals/providers/eval-utils.ts` with `skipIfUnavailable`
- [x] Bedrock columns in text, image, and voice baseline configs

### Done (red teaming — phase 4)

- [x] `evals/promptfooconfig.redteam.yaml` with prompt-injection + jailbreak strategies
- [x] Scripts: `pnpm eval:promptfoo:redteam`, `pnpm eval:promptfoo:redteam:generate`

### Done (optional CI — phase 5)

- [x] Manual GitHub Actions workflow: `.github/workflows/evals-promptfoo.yml` (OpenRouter only)

## v1.2 — Langfuse (AI observability)

Integrate [Langfuse](https://langfuse.com) for every AI step in the search pipeline: text query interpretation, image analysis, voice transcript enhancement, and localized voice result summaries (OpenRouter / AWS Bedrock).

### Why Langfuse

- **End-to-end traces** — one trace per search request spanning STT → AI interpret → commercetools → TTS summary, with nested spans per provider call
- **Latency breakdown** — see which step dominates (ElevenLabs STT, LLM, Product Search API, ElevenLabs TTS) and optimize the slow path
- **Cost & token usage** — track spend per model, provider, and endpoint; compare OpenRouter vs Bedrock in production
- **Prompt management** — version and deploy prompts (`TEXT_QUERY`, image, voice enhance, TTS summary) without code releases; roll back bad prompt changes quickly
- **Locale-aware debugging** — correlate `queryLocale` / `catalogLocale` with AI inputs and outputs (e.g. wrong-language `searchTerms`, empty CT results despite high `total`)
- **Production debugging** — replace ad-hoc `CAT_DEBUG` logs with searchable traces, inputs/outputs, and error context in staging and production
- **Quality & evaluations** — score interpretations and voice summaries; build datasets from real queries for regression tests when changing prompts or models (offline regression covered today by [Promptfoo](evals/); Langfuse adds production-sourced datasets and scoring)
- **User/session context** — attach `sessionId`, widget props, and search mode (text / voice / image) to traces for support and analytics
- **Governance** — audit trail of what was sent to external LLMs (retention policies, PII considerations for voice transcripts)

### Implementation checklist

- [x] Langfuse SDK in `@commerce-ai-tool/core` (wrap AI provider calls or orchestrator spans)
- [x] Env config: `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL` (optional self-host)
- [x] Trace metadata: `queryLocale`, `catalogLocale`, search type, commercetools `projectKey`, model id
- [x] Instrument all `AIProvider` methods: `interpretTextQuery`, `interpretImageQuery`, `enhanceVoiceTranscript`, `summarizeVoiceResults`, `suggestSearchTerms`
- [x] Link server voice handler span to core child spans (single trace id returned optionally in dev)
- [x] Document setup in `.env.example` and README; note relationship to existing `CAT_DEBUG` dev tracing
- [ ] Optional: Langfuse prompt labels synced with `packages/core/src/prompts` for managed prompts

## v1.3 — Cart

- [ ] Add to cart via commercetools Cart API
- [ ] Anonymous and authenticated cart sessions
- [ ] Cart preview in search results panel

## v2.0

- [ ] Checkout flow integration
- [ ] Payment provider hooks
- [ ] Order confirmation and tracking
