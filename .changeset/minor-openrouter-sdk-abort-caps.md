---
"@commerce-ai-tool/core": minor
"@commerce-ai-tool/server": minor
---

OpenRouter calls now use `@openrouter/sdk` 1.x for every modality; the voice audio path no longer posts to the API with a raw `fetch`. The SDK retries 429, 5xx and connection resets with a small backoff that stops scheduling retries after 4 s, so it fits inside the default 15 s AI step timeout. OpenRouter `usage.cost` is now reported on every call.

New `signal` on `AICallOptions`, `TextSearchRequest`, `SuggestionsRequest` and the `searchByVoice` / `searchByImage` options. A step timeout now aborts its in-flight OpenRouter call instead of only racing it. The Next.js handlers pass `req.signal`. The Express router aborts when the response closes before it finished. A cancelled search stops its remaining AI and commercetools steps, returns status 499 and is not logged as an error (any error raised after the request signal aborted, including Next 16's `ResponseAborted` reason). Results assembled during an abort are not cached. `withTimeout` now takes `(signal) => Promise<T>` plus an optional parent signal. Bedrock (`abortSignal` on `client.send`) and ElevenLabs text-to-speech (`/tts`) take the signal too; ElevenLabs speech-to-text does not yet.

New typed errors exported from core, mapped by the server with fixed messages (the provider body never reaches the browser): `AIRateLimitedError` → 429 `RATE_LIMITED`; `AIUpstreamError` (402 credits, 5xx, connection failure) → 503 `UPSTREAM_UNAVAILABLE`; `AIOutputTruncatedError` → 503 `UPSTREAM_UNAVAILABLE`.

Every OpenRouter call now sets an output-token cap (`maxCompletionTokens`, exported as `MAX_TOKENS`: interpret, refine, image, mission and voice audio 2000; suggest 1000; voice enhance and TTS summary 600) and `reasoning: { effort: "low" }`. The caps include reasoning tokens. Voice audio used to allow 4096 tokens. A response cut by the cap (`finish_reason: "length"`) now fails with `AIOutputTruncatedError`, which surfaces as a 503 on the search routes. Truncated JSON is no longer repaired into partial results: `parseModelJson` still strips code fences and prose but rejects unterminated JSON. Voice enhance now runs at `temperature: 0`. The `json_schema` → `json_object` fallback now triggers only on a 400 that says json_schema or response_format is unsupported. It is remembered per model, so later calls skip the failing json_schema request.
