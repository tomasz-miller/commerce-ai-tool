---
"@commerce-ai-tool/core": minor
"@commerce-ai-tool/server": minor
---

Fewer LLM calls per search, and cache keys that no longer leak per-request fields.

- Behaviour change: the spoken voice summary (`ttsText`) is now the deterministic `buildTtsSummaryFallback` sentence by default, with no LLM call. Set `CAT_VOICE_LLM_SUMMARY=true` (`CommerceAIConfig.voice.llmSummary: true`) to keep the LLM-written summary (`summarizeVoiceResults`). Any value other than `true` or `false` fails at startup.
- The ElevenLabs STT voice path makes one structured call instead of two: the new optional `AIProvider.interpretVoiceTranscript` (prompt `commerce-ai/voice-transcript-interpret`, schema `VOICE_TRANSCRIPT_JSON_SCHEMA`, token cap `MAX_TOKENS.voiceTranscript`) returns `enhancedQuery` plus the interpreted search. OpenRouter and Bedrock implement it. A custom provider without it keeps the old `enhanceVoiceTranscript` → `interpretTextQuery` sequence. `enhanceVoiceTranscript` stays on the interface. Hosts on Langfuse-managed prompts should run `pnpm sync:langfuse-prompts` to create the new prompt; until then the local prompt is used.
- Shopping missions: `decomposeShoppingMission` runs only when `looksLikeShoppingList(query, locale)` (new; in `@commerce-ai-tool/core/client` and `@commerce-ai-tool/core/internal`) says the query may list several products (separators, bullets, numbered items, conjunctions for en, de, pl, fr, es, it, nl, or three or more words; other languages are not gated). Only one- or two-word queries without a separator skip the call. Voice checks both the transcript and the enhanced query. Image search calls it only when the vision output has two or more phrases. On voice and image the mission call now runs in parallel with the standard product search.
- The interpreted-search cache stores only products, total, facets and the zero-result retry level; `queryInterpretation`, `queryLocale`, `searchTerms`, `primaryTerm` and `appliedFilters` come from the current request on a hit, so one shopper's interpretation is no longer shown to another. The text-search cache key now includes `sort`, so requests that differ only by sort no longer share a cached ordering.
