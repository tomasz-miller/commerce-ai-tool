---
"@commerce-ai-tool/server": minor
"@commerce-ai-tool/core": minor
"@commerce-ai-tool/react": patch
"@commerce-ai-tool/angular": patch
---

Customer session tokens are shorter-lived and revocable. New tokens live 24 hours (`CART_SESSION_TTL_SECONDS`, was 7 days) and carry `{ customerId, iat, exp }` without the customer email; tokens issued earlier (7-day lifetime, with `email`, without `iat`) are rejected, see the 3.0.0 migration guide. Login still returns `customer` with the email.

New optional `CartSessionConfig.isRevoked({ customerId, iat })` and `CartSessionConfig.onLogout({ customerId, iat, exp })`. `isRevoked` (sync or async) runs on every validly signed, unexpired token on cart, checkout, payment and order routes; `true` returns 401 `SESSION_INVALID`. `POST /cart/logout` now reads the `x-commerce-ai-cart-session` header and calls `onLogout` for a valid, unrevoked token; it returns 200 `{ cart: null, customer: null }` without a token or with an invalid one (a host hook that throws fails the request with 500). `createNextHandlers().logout` and `createHandlers().logout` take an optional request: Next.js hosts should change their logout route to `POST(req) { return handlers.logout(req); }`. The React and Angular widgets send the session header on logout.

`CAT_CART_SESSION_SECRET` (`config.cartSession.secret`) must be at least 32 bytes, and is required unless `NODE_ENV` is `development` or `test`: the server refuses to start otherwise and the commercetools client secret is no longer a fallback.
