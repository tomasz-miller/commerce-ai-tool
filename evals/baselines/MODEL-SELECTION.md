# Model selection (retrieval matrix)

Ran 2026-09-09 against the live `zero-to-ct-storefront` catalog (`en-GB`). Four queries × four OpenRouter models. Raw cells: [`models-matrix.summary.json`](models-matrix.summary.json).

OpenRouter did not return `usage.cost` on these responses, so **tokens per query and latency** are the cost proxies. Precision@5 is hits in the top 5 against the golden SKUs in `evals/tests/retrieval.yaml`.

| Model | Pass | Precision@5 | Recall@5 | Tokens / query | Latency |
|-------|------|-------------|----------|----------------|---------|
| `openai/gpt-5.6-luna` (current text default) | 4/4 | 0.52 | 0.60 | 1172 | 4.0s |
| `openai/gpt-4.1-mini` | 4/4 | 0.52 | 0.60 | 1190 | 2.7s |
| `google/gemini-2.5-flash` | 3/4 | 0.52 | 0.60 | 1138 | 1.8s |
| `google/gemini-3.7-flash` | 3/4 | 0.62 | 0.69 | 1682 | 4.4s |

Gemini failures were the same: `wine glass` emitted 4 phrases instead of one. Ranking still put `CWG-01` first because `primaryTerm` stayed `wine glass`. That is a prompt-contract miss, not a retrieval miss.

Sample size is four queries. Treat this as a first cut, not a production bake-off.

## Recommendation

**Text (`OPENROUTER_MODEL`) — keep `openai/gpt-5.6-luna`.** It is the only current default that both passed the suite and kept specific queries to a single phrase. `openai/gpt-4.1-mini` matched pass rate and precision@5 at ~30% lower latency with almost the same token count; it is the first cheaper candidate to re-run on a larger golden set before switching the default. Do not use Gemini Flash for text interpretation: it over-expands named products.

**Vision (`OPENROUTER_VISION_MODEL`) — keep `google/gemini-3.7-flash`.** Image fixtures were not part of this matrix. The bottleneck is vision, not JSON shape (strict schema already carries the contract). Flash is already cheaper than Luna for multimodal; using Luna for images would raise cost without a retrieval win.

**Voice (`OPENROUTER_VOICE_MODEL`) — keep `google/gemini-3.7-flash` for `interpretVoiceAudio`.** Direct audio needs a multimodal model. Transcript enhance + `interpretTextQuery` can follow the text recommendation (`gpt-5.6-luna` today, `gpt-4.1-mini` if a later retrieval run stays green).

Re-run:

```bash
pnpm eval:models
```
