# Retrieval eval baselines

Commit compact summaries here after a green local run:

- [`models-matrix.summary.json`](models-matrix.summary.json) — cheaper-model matrix on the retrieval suite
- [Model selection notes](MODEL-SELECTION.md)

Do not commit the full Promptfoo JSON dump (it includes request traces). Write it locally if you need the raw table:

```bash
pnpm exec promptfoo eval -c evals/promptfooconfig.models.ts --env-file evals/.env -o evals/output/models-matrix.json
pnpm eval:promptfoo:retrieval
```

Do not commit API keys. Summaries are a regression snapshot of pass rate, tokens, latency, and precision@5 — not a CI gate.
