---
"@commerce-ai-tool/react": patch
"@commerce-ai-tool/angular": patch
---

Give the cart panel a fully opaque background and drop the fade-in so product cards behind it never show through. Refresh the cart when the panel opens so it never shows stale items after a mutation from another cart hook instance.
