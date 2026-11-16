---
"@commerce-ai-tool/react": patch
"@commerce-ai-tool/angular": patch
---

The widgets send the guest `anonymousId` in the `x-commerce-ai-anonymous-id` header on cart, shipping-method, payment-method and order reads instead of the URL query string, and generate new ids (and order numbers) with `crypto.getRandomValues` when `crypto.randomUUID` is unavailable (plain HTTP) instead of `Math.random`. Existing stored ids keep working.
