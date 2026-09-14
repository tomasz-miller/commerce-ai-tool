# @commerce-ai-tool/react

## 2.5.0

### Minor Changes

- a124040: Add the Angular demo host (`apps/demo-angular`) with full `demo-next` parity: search with cart and missions, product preview, host-owned checkout and order pages, and a standalone Express BFF.

### Patch Changes

- a124040: Share widget CSS through `@commerce-ai-tool/styles` and align the Angular search widget and demo host with the React/Next layout (search shell, voice banner, dark page chrome).

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
