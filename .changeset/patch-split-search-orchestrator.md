---
"@commerce-ai-tool/core": patch
"@commerce-ai-tool/server": patch
---

Internal refactor, no behaviour change: the search orchestrator is split into one module per pipeline (text, voice, image, suggestions, product search, missions) behind a shared pipeline context, and runtime constants moved out of `types/` into `config/defaults`. `resolveVoiceMode` (in `@commerce-ai-tool/core/internal`) is now used by the server instead of its own identical copy. `SearchOrchestrator.getFacetSchema` is required in the type since 3.0.0.
