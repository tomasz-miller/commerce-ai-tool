# @commerce-ai-tool/angular

## 2.4.0

### Initial public release

First published version of the Commerce AI Tool Angular widget (product roadmap through v2.4).

- Standalone search component with independent voice, camera, and image-upload controls
- Autocomplete, facets (including hex color swatches), cart panel, and shopping-mission lanes with batched add-to-cart
- Runtime `messages` overrides
- Client bundle does not depend on `@commerce-ai-tool/core` at runtime (client-safe helpers are bundled). Install `@commerce-ai-tool/server` on the host for the BFF.

```bash
pnpm add @commerce-ai-tool/angular @commerce-ai-tool/server
```
