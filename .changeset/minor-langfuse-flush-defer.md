---
"@commerce-ai-tool/server": minor
"@commerce-ai-tool/core": minor
---

The Langfuse flush no longer fails or delays a request. `flushLangfuse()` never rejects (a failed export used to turn a successful search, voice, image or TTS call into a 500); it logs at most one warning per minute with the error name only. The flush is now scheduled after the request span has ended, so the root span is part of the exported batch, and it is not awaited before the response. New `NextHandlerOptions.defer`: pass `after` from `next/server` (`createNextHandlers(config, { defer: after })`) to run the flush after the response; without it the flush starts detached. The Express router flushes on `res.on("finish")` or `close`, or immediately if the response already ended. `scheduleFlush(defer?)` and the `FlushDefer` type are exported from `@commerce-ai-tool/server/flush` for hosts that build their own adapters. The `createHandlers` AI handlers (`search`, `searchSuggestions`, `searchVoice`, `searchImage`, `tts`) accept an optional second `defer` argument.

Core upgrades `@langfuse/client` and `@langfuse/tracing` to 6.x (the server's host apps use `@langfuse/otel` 6.x). Langfuse 6 JSON-encodes span metadata values, gzips span batches (`compression: "none"` or `LANGFUSE_OTEL_COMPRESSION=none` turns that off), needs self-hosted Langfuse 4.59.0 or newer and Node.js 22 or newer. Keep `@opentelemetry/sdk-node` below 0.300 (`@langfuse/otel` 6 accepts OTLP exporter peers `>=0.202 <0.300`). Use `exportMode: "immediate"` on `LangfuseSpanProcessor` for serverless hosts. See docs/OBSERVABILITY.md.
