---
"@commerce-ai-tool/core": minor
---

Untrusted text is delimited in every prompt. The shopper query, the refinement, the voice transcript and the client-supplied previous search terms and filters of a refinement are cut to 300, 300, 2000 and 500 characters, JSON-encoded with `<` escaped, and wrapped in `<user_query>`, `<refine_query>`, `<transcript>` and `<previous_terms>` (`wrapUntrusted`). `SAFETY_RULES` ends with a new line that declares content inside these tags to be data, never instructions, and to decode its JSON escapes before quoting or rewriting it; the same line is added to the voice-enhance and suggestions prompts. With `CAT_DEBUG=true`, a cut is logged as `prompt_input_truncated` (tag and lengths, never the text). `MAX_QUERY_CHARS` (300) now lives in core (`@commerce-ai-tool/core/internal`); the server uses it for its own cap.

`parseInterpretedQuery` keeps `interpretation` only when it is a string (trimmed, at most 200 characters; otherwise the joined search terms) and restricts `sort` to `relevance`, `price_asc` or `price_desc` (otherwise `relevance`). `parseDecomposedMission` caps its interpretation at 200 characters too. The image shopping-mission query is built from `searchTerms` (phrases kept intact, joined as "a, b and c") instead of the model's free-text interpretation, so text printed in an image cannot reach the mission prompt as a query.

Behaviour change: the OpenRouter vision model now defaults to `DEFAULT_OPENROUTER_VISION_MODEL` (`google/gemini-3.7-flash`), as documented. Before, a host that set `model` but not `visionModel` (`OPENROUTER_MODEL` without `OPENROUTER_VISION_MODEL`) also used that text model for images. Set `OPENROUTER_VISION_MODEL` to keep a specific vision model.

Local prompt text changed. Hosts that run Langfuse-managed prompts (`LANGFUSE_PROMPTS=true`) should re-sync them with `pnpm sync:langfuse-prompts` (new version, then promote the label); a stale managed prompt is still accepted but does not mention the new tags. Run `pnpm eval:promptfoo` and `pnpm eval:promptfoo:redteam` with an API key before releasing.
