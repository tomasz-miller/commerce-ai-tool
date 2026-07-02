# Audio fixtures for voice Promptfoo evals

Short spoken WAV clips used by `evals/providers/voice-audio-provider.ts`.

## Regenerate (macOS)

From the repository root:

```bash
pnpm eval:fixtures:audio
```

Requires built-in `say` and `afconvert` (macOS). On other platforms, record equivalent clips manually or use another TTS tool, then place WAV files here:

| File | Spoken content | Locale context |
|------|----------------|----------------|
| `red-shoes-en.wav` | "red shoes" | `queryLocale: en`, `catalogLocale: no` |
| `tapetkniv-pl.wav` | "nóż do tapet" (or closest TTS approximation) | `queryLocale: pl`, `catalogLocale: no` |
| `noisy-filler-en.wav` | "um, I want like, red shoes please" | `queryLocale: en`, `catalogLocale: no` |
| `cheapest-running-shoes-en.wav` | "cheapest running shoes" | `queryLocale: en`, `catalogLocale: no` |
| `hello-en.wav` | "hello" | `queryLocale: en`, `catalogLocale: no` |

Baseline transcript providers use the `transcript` column in [`tests/voice-search.yaml`](../tests/voice-search.yaml); audio providers use `audioFile`.
