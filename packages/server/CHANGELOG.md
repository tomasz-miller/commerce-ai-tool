# @commerce-ai-tool/server

## 2.4.0

### Initial public release

First published version of the Commerce AI Tool plugin (product roadmap through v2.4).

- Next.js App Router and Express handlers for `/api/commerce-ai/*` (search, suggestions, voice, image, TTS, cart, checkout, orders)
- Secrets stay on the host; widgets never receive API keys
- Cart sessions (anonymous + customer login/merge), checkout addresses and shipping, payments, and orders
- Shopping-mission decomposition and batched `POST /cart/add-items`
- Opt-in Langfuse traces and response caching

Depends on `@commerce-ai-tool/core`. Install with the widget your host uses:

```bash
pnpm add @commerce-ai-tool/react @commerce-ai-tool/server
# or
pnpm add @commerce-ai-tool/angular @commerce-ai-tool/server
```
