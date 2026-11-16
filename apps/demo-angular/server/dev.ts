// Entry of `pnpm dev:bff`. The BFF refuses to start without a CAT_CART_SESSION_SECRET unless
// NODE_ENV is "development" or "test" (it then uses a random per-process secret). Setting it
// here, before the BFF module graph loads, keeps the script free of shell-specific syntax.
// `pnpm start` (dist-server/index.js) does not go through this file: set the secret there.
process.env.NODE_ENV ??= "development";

await import("./index.js");
