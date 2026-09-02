# Observability

Local console tracing (`CAT_DEBUG`) and optional [Langfuse](https://langfuse.com) production traces. They complement each other; Promptfoo evals cover prompt quality offline ([`evals/README.md`](../evals/README.md)).

[Documentation index](README.md) · [Search pipeline](search-pipeline.md)

## CAT_DEBUG

Set `CAT_DEBUG=true` (or run non-production). `logSearchTrace` in `packages/core/src/utils/dev-trace.ts` prints search input, interpreted terms, and the commercetools request body.

## Langfuse

Opt-in production tracing for text / voice / image search and TTS: AI generations, commercetools search, and ElevenLabs STT/TTS nest under one OpenTelemetry request span.

- Set `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` (and optionally `LANGFUSE_BASE_URL` for self-host or non-EU regions). Without both keys, tracing is a no-op.
- Host apps must register a `LangfuseSpanProcessor` once (see `apps/demo-next/src/instrumentation.node.ts`) and may call `registerLangfuseFlush` from `@commerce-ai-tool/server/flush` (or set the shared `globalThis` flush key) for serverless flush.
- Autocomplete (`/search/suggestions`) is **not** traced by default (high keystroke volume). CT-only hits stay off the request span; when the AI fallback runs, `suggestSearchTerms` still emits a generation via the wrapped AI provider. Set `LANGFUSE_TRACE_SUGGESTIONS=true` to also trace the Suggest request span.
- When Langfuse is enabled or `CAT_DEBUG=true`, responses may include `meta.traceId` for local linking (non-stable client contract).
- Binary image/audio payloads are redacted from traces (mime type, byte length, hash only). Voice **transcripts** may still contain personal speech content — configure Langfuse retention accordingly.

Optional env: `LANGFUSE_PROMPT_LABEL` (default `production`), `LANGFUSE_PROMPT_CACHE_TTL_SECONDS` (default `60`). Matching fields exist on `CommerceAIConfig.langfuse`.

## Prompt management

System prompts live in git under `packages/core/src/prompts` (source of truth for Vitest and Promptfoo). Optionally push them to Langfuse and fetch by label at runtime:

1. Sync catalog → Langfuse staging: `pnpm sync:langfuse-prompts` (or `-- --dry-run`). Promote with `pnpm sync:langfuse-prompts -- --label production` only after Promptfoo passes.
2. Enable runtime fetch with `LANGFUSE_PROMPTS=true` (same API keys), or set `langfuse.promptsEnabled` on `CommerceAIConfig` (applied when creating the search orchestrator). Missing or failed fetches fall back to the local catalog; failures are logged when `CAT_DEBUG=true` / non-production. Promptfoo evals call `configureLangfusePrompts({ promptsEnabled: false })` so they always use the git catalog.
3. Generations link to the Langfuse prompt version when managed text is used (not on local fallback).

User-message builders and JSON parsers stay in code — only system prompt text is managed remotely.
