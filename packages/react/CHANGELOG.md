# @commerce-ai-tool/react

## 2.4.0

### Initial public release

First published version of the Commerce AI Tool React / Next.js widget (product roadmap through v2.4).

- Glass search UI with independent voice, camera, and image-upload controls
- Autocomplete, facets (including hex color swatches), cart panel, checkout, and order status
- Shopping-mission lanes with batched add-to-cart
- Runtime `messages` overrides
- Client bundle does not depend on `@commerce-ai-tool/core` at runtime (client-safe helpers are bundled). Install `@commerce-ai-tool/server` on the host for the BFF.

```bash
pnpm add @commerce-ai-tool/react @commerce-ai-tool/server
```
