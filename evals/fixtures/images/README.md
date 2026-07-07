# Image fixtures for vision evals

Small JPEG images used by `pnpm eval:promptfoo:image`. Each file is compressed to stay under **100 KB** (total under **300 KB**).

| File | Scenario | Expected catalog terms (`no`) |
|------|----------|-------------------------------|
| `red-shoes.jpeg` | Red sports shoes | `rød`/`røde` + `sko` |
| `wallpaper-knife.jpeg` | Wallpaper knife product | `tapetkniv` |
| `sky-above-forest.jpeg` | Non-commerce landscape | Valid JSON + `interpretation` (no product terms required) |

## Regenerate / compress

From the repository root:

```bash
pnpm eval:fixtures:images
```

Uses macOS `sips` when available; falls back to `ffmpeg` on Linux. Parameters: max **512 px** longest edge, JPEG quality **~80**. PNG fixtures without transparency are converted to JPEG in place.

## Source

Fixture images are sample photos for local Promptfoo regression tests only. Replace with your own licensed assets if redistributing the repository.
