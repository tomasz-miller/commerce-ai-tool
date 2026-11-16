---
"@commerce-ai-tool/core": minor
---

Bedrock now uses the Converse API properly. The resolved system prompt is sent in `system` instead of being concatenated into the user message, so shopper text no longer shares a turn with the rules. Calls set `inferenceConfig: { maxTokens, temperature: 0 }` with the same per-task caps as OpenRouter (`MAX_TOKENS`); `stopReason: "max_tokens"` throws `AIOutputTruncatedError` (503) after metrics are reported. JSON methods send the schema through `outputConfig.textFormat` (`json_schema`) and retry once without it when the model answers `ValidationException`. JSON extraction now applies only to the structured methods, so voice enhance and TTS summary keep text containing braces intact. The `signal` of `AICallOptions` is passed to `client.send` as `abortSignal`, and the client sets `maxAttempts: 3` explicitly.

Bedrock availability errors are now typed: `ThrottlingException` and `ServiceQuotaExceededException` become `AIRateLimitedError` (429 `RATE_LIMITED`); `ServiceUnavailableException`, `InternalServerException`, `ModelNotReadyException` and `ModelTimeoutException` become `AIUpstreamError` (503). The AWS message no longer reaches the browser. Validation and access-denied errors are unchanged.

`DEFAULT_BEDROCK_MODEL` is unchanged, but the default model is a legacy one that AWS no longer lists. Set `BEDROCK_MODEL_ID` to a current inference profile; `docs/CONFIGURATION.md#bedrock-converse` compares geo (`eu.`/`us.`) and global profiles. Re-run `pnpm eval:promptfoo` with the Bedrock columns before switching, because Claude 5 models think adaptively by default and thinking counts toward `maxTokens`.
