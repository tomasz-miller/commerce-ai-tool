---
"@commerce-ai-tool/server": minor
"@commerce-ai-tool/core": minor
---

Typed API errors. Every non-2xx host response now carries a machine-readable `code` next to `error` (`{ error, code }`). `ApiErrorCode` and `ApiErrorBody` are exported from `@commerce-ai-tool/core/client`. Malformed or non-object JSON bodies and missing `text`/`query` fields now return 400 `VALIDATION` instead of 500. Unexpected errors return the generic per-route message with `code: "INTERNAL"` instead of the internal error message (this changes the body of 500 responses). The "voice service is not configured" case returns 503 `UPSTREAM_UNAVAILABLE`. `logServerError` now always logs the handler, error class and message at error level; the request payload, stack and cause are logged only with `CAT_DEBUG=true`.
