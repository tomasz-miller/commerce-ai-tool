# Cart and checkout

Opt-in cart, host-owned checkout, payments, and order lookup. Search remains usable without any of this.

[Documentation index](README.md) · [Getting started](GETTING-STARTED.md)

## Cart levels

Cart is off by default so existing `onProductSelect` integrations stay unchanged. Product row clicks still fire `onProductSelect` (for example PDP navigation). Add-to-cart is a separate icon on the card.

| Level | How | UI |
|-------|-----|----|
| Off (default) | Omit `enableCart` | No cart icon, no add-to-cart buttons |
| Built-in | `enableCart` | Header cart badge, slide-over preview, add-to-cart on results |
| Custom | `useCart({ apiBaseUrl })` / `CommerceAiCartService` | Host app owns the cart UI; same `/cart` endpoints |

Multiple `useCart()` hooks (React) or `CommerceAiCartService` instances (Angular) in the same tab share cart snapshots. A host product sheet that calls `addToCart` updates the widget badge and panel without an extra click.

```tsx
import { CommerceAISearch, useCart } from "@commerce-ai-tool/react";

const cart = useCart({ apiBaseUrl: "/api/commerce-ai", currency: "EUR" });
await cart.login({ email, password });
await cart.logout();
```

Set `onCheckout` to navigate from the cart panel to a host-owned route:

```tsx
<CommerceAISearch
  apiBaseUrl="/api/commerce-ai"
  enableCart
  onCheckout={() => router.push("/checkout")}
/>

// app/checkout/page.tsx (client component)
<CommerceAICheckout
  apiBaseUrl="/api/commerce-ai"
  catalogLocale="en"
  currency="EUR"
  country="DE"
/>
```

### Landmarks, headings and links in `CommerceAICheckout` and `CommerceAIOrderStatus`

Both components are embedded in a host page, so the host owns the `<main>` landmark, the page `<h1>` and the router.

| Prop | Default | Effect |
|------|---------|--------|
| `as` | `"section"` | Root element: `"main"`, `"section"` or `"div"`. A `section` or `main` is named by the widget title (`aria-labelledby`), so a `section` is a region landmark. A `div` has no role and no name. |
| `headingLevel` | `2` | Tag level of the widget title (`1`, `2` or `3`). Headings inside the widget follow: sections one level below the title, the billing address two. Only the tag changes, never the styling. |
| `renderLink` | plain `<a>` | `(props: { href: string; className: string; children: ReactNode }) => ReactNode`. Renders the "continue shopping" and "view order status" links and every order link in the order list. |

Earlier releases always rendered a `<main>` with an `<h1>`, and the sections were `<h2>`. To keep the same elements and heading levels, pass `as="main"` and `headingLevel={1}` (the root also gains `aria-labelledby` and the title gains an `id`). With the defaults the title is an `<h2>`, the section headings are `<h3>` and the billing heading is an `<h4>`, and a page that already has a `<main>` no longer ends up with two.

```tsx
import Link from "next/link";

<CommerceAICheckout
  apiBaseUrl="/api/commerce-ai"
  continueShoppingHref="/"
  orderStatusHref="/orders"
  renderLink={({ href, className, children }) => (
    <Link href={href} className={className}>
      {children}
    </Link>
  )}
/>
```

Without `renderLink` the components render `<a href className>`, which reloads the page. The link is rendered exactly where the anchor was, so pass the `className` through to keep the styling.

## Routes

Cart: `GET /cart`, `POST /cart/add`, `POST /cart/add-items`, `POST /cart/remove`, `POST /cart/update-quantity`, `POST /cart/login`, `POST /cart/logout`.

Checkout: `POST /cart/addresses`, `GET /cart/shipping-methods`, `POST /cart/shipping-method`, `GET /cart/payment-methods`, `POST /cart/payment`, `POST /cart/order`.

Orders: `GET /orders` lists recent orders for the current cart identity; `GET /orders?orderNumber=…` returns a single client-safe snapshot. A customer session sees only the customer's own orders; the guest `anonymousId` is ignored when a valid session token is present. After checkout, render `CommerceAIOrderStatus` on a host route (the demo uses `/orders?orderNumber=…`) for payment/shipment state and parcel tracking from commercetools deliveries.

The commercetools project must have a Shipping Method with a Zone matching the checkout country. When no matching shipping methods exist, checkout still allows placing the order after a successful address step. When no payment provider is configured, `GET /cart/payment-methods` returns an empty list and checkout skips the payment step.

Order creation and payment authorization are rate-limited (20 attempts per 15 minutes per client). Login is rate-limited to 10 attempts per 15 minutes per client. Separately, 10 failed logins for one email address within 15 minutes lock that email's login for the rest of the window (soft lockout): further attempts get 429, even with the correct password, until the window ends. Successful logins and server errors do not count, and other emails are unaffected. Each attempt reserves a slot before calling commercetools and gives it back unless the password was wrong, so parallel failed attempts cannot exceed the 10. The email is keyed on a SHA-256 hash and is not stored. The trade-off: anyone who knows an address can lock it for up to 15 minutes with 10 wrong passwords, but distributed password guessing against one account (many IPs, one email) is capped at 10 guesses per 15 minutes. The limiter is in-process and holds at most 10,000 emails: when it is full it evicts the coldest window (lowest count), so resetting a locked email requires every other tracked email to be at least as hot, which the per-client login limit bounds. Multi-instance or high-risk hosts should add an edge or WAF limit (see below) or a shared rate-limit store. How the client is identified differs per adapter: see [rate limits](CONFIGURATION.md#rate-limits-and-input-caps).

These limits are in-memory and per instance. A host that runs several instances (serverless, autoscaled containers) gets a separate counter per instance, so put an edge or WAF rate limit in front of `/cart/login`, `/cart/order`, `/cart/payment` and the AI routes as well.

`orderNumber` on `POST /cart/order` and `POST /cart/payment` is optional. When sent it must match `cat-<uuid>`, a lowercase 8-4-4-4-12 UUID (`ORDER_NUMBER_PATTERN` from `@commerce-ai-tool/core`, the shape both widgets generate); anything else returns 400 `VALIDATION`. Without it the server generates one.

Line item quantities must be integers: 1–99 on `POST /cart/add` and on each `POST /cart/add-items` item, 0–99 on `POST /cart/update-quantity` (0 removes the line). Other values return 400 `VALIDATION`. Cart mutations carry no version: the server applies each change to the current cart version and retries once on a concurrent-modification conflict (last write wins). The `cartVersion` request field was removed in 3.0.0; a body that still sends it is accepted and the field is ignored.

## Session identity

- **Guest** — `anonymousId` in `localStorage` (`commerce-ai-tool:anonymousId`), a random UUID from Web Crypto (`crypto.randomUUID`, or `crypto.getRandomValues` outside secure contexts). The server looks up the Active cart by `anonymousId`. GET reads (`/cart`, `/cart/shipping-methods`, `/cart/payment-methods`, `/orders`) send it in the `x-commerce-ai-anonymous-id` header (`ANONYMOUS_ID_HEADER`); mutations send it in the JSON body. Since 3.0.0 the server reads the guest id from this header only: an `anonymousId` query parameter is ignored, so a GET without the header is rejected with 400 `VALIDATION`. Cross-origin hosts must allow the header in CORS (`createExpressRouter({ corsOrigins })` reflects the requested headers by default).
- **Customer** — HMAC-SHA256 session token (`commerce-ai-tool:customerSession`) signed with `CAT_CART_SESSION_SECRET` (`config.cartSession.secret`). A secret is required and must be at least 32 bytes (the UTF-8 length of the trimmed value, so 32 ASCII characters or 16 two-byte characters). `createCommerceAIServer` (and so `createNextHandlers`, `createNextRouteHandler` on its first request, and `createExpressRouter`) throws at startup if it is shorter, in every environment, and if it is missing unless `NODE_ENV` is exactly `development` or `test`: an unset `NODE_ENV` (common for Express hosts), `staging` and `production` all require it. Only `createCommerceAIServer` validates the secret; code that builds handlers some other way must check its own. The `cartSessionSecret` field of the server object is non-enumerable, so logging the object does not print it. The commercetools client secret is never used as a signing key. In `development` and `test` an unset secret is replaced by a random one that lives as long as the process (shared through `globalThis`, so a dev-server reload keeps tokens valid), with one warning; customer sessions then end when the server restarts. Generate a secret with `openssl rand -base64 48`. A valid token wins over `anonymousId`. GET reads send it as `x-commerce-ai-cart-session` (never as a query parameter); mutations send `sessionToken` in the JSON body. Login still returns `customer` (with the email) for display.
- **Token payload and lifetime** — new tokens carry `{ customerId, iat, exp }` (no email) and live 24 hours (`CART_SESSION_TTL_SECONDS`). `iat` is mandatory since 3.0.0: a token without it (every token issued by 2.x), with a negative or non-numeric `iat`, or with an `iat` more than 60 seconds in the future is rejected with 401 `SESSION_INVALID`. Shoppers who were signed in with an older token sign in again, which the widgets do after the 401.
- **Revocation hooks** — the tokens are stateless, so revocation is opt-in via `config.cartSession`:

  ```ts
  createNextHandlers({
    ...loadConfigFromEnv(),
    cartSession: {
      secret: process.env.CAT_CART_SESSION_SECRET,
      // Called for every validly signed, unexpired token on cart, checkout, payment and order routes.
      isRevoked: async ({ customerId, iat }) => denylist.isRevoked(customerId, iat),
      // Called by POST /cart/logout with the verified token payload.
      onLogout: async ({ customerId, iat, exp }) => denylist.add(customerId, iat, exp),
    },
  });
  ```

  `isRevoked` may be sync or async; returning `true` rejects the request with 401 `SESSION_INVALID`, and an error thrown by the hook fails the request with 500. The hook receives the token's `iat`, so a cutoff such as "revoke everything issued before T" works. `loadConfigFromEnv()` sets only `secret`; the hooks are code-only.
- **Login** — commercetools `POST /{projectKey}/login` with `anonymousCartSignInMode: MergeWithExistingCustomerCart`. A client `cartId` is merged only after the cart is loaded and `cart.anonymousId` matches the request `anonymousId`. Only that verified cart is sent (`anonymousCart`); the guest `anonymousId` is never forwarded, because commercetools would then assign every Cart, Order and Payment with that id to the customer. Guest orders placed before login therefore stay guest orders. Passwords are never logged or sent to Langfuse. Catalog `storeKey` is not applied to login (cart CRUD is project-scoped). Manual testing needs a Customer account in the project (do not commit passwords).
- **Logout** — the widget sends the token in the `x-commerce-ai-cart-session` header to `POST /cart/logout`, then drops it and creates a new guest `anonymousId`. When the header carries a valid, unrevoked token the server calls `cartSession.onLogout` with its payload. Logout returns 200 `{ cart: null, customer: null }` whatever token it gets; without a token, or with an invalid, expired or revoked one, `onLogout` is not called. The one exception is a host hook that throws (`isRevoked` or `onLogout`): that fails the request with 500 `INTERNAL` and the hook's message is not sent to the browser. The widgets drop the session locally even then. Without hooks the server keeps no state, so a copied token stays valid until it expires. Next.js routes must pass the request: `POST(req) { return handlers.logout(req); }`.
- **Stale `cartId`** — cart mutations check the cart behind a client `cartId` after the ownership check. A cart that is not `Active` (`Ordered`, `Merged` or `Frozen`) is never modified. `POST /cart/add` and `POST /cart/add-items` fall back to the identity's active cart (and create one when there is none); `POST /cart/remove` and `POST /cart/update-quantity` fail with 404 `CART_NOT_FOUND`, because a line item id belongs to one cart. Checkout routes also reject a non-Active cart.
- **Batch add** — `POST /cart/add-items` adds 1–20 line items in one Cart update (mission “Add top picks”, first product per filled lane at quantity 1). Per-card add uses `POST /cart/add`.

## Cart price scope (`cartPolicy`)

commercetools selects line-item prices by the cart `currency` and `country`. By default the server uses the `currency` and `country` sent with `POST /cart/add` and `POST /cart/add-items`, falling back to `defaults.currency` / `defaults.country`. Hosts that sell into several countries or currencies should set `cartPolicy` so the cart's currency and the shipping country stay within server policy:

```ts
createNextHandlers({
  ...loadConfigFromEnv(),
  cartPolicy: {
    allowedCountries: ["DE", "AT", "CH"],
    currencyByCountry: { DE: "EUR", AT: "EUR", CH: "CHF" },
  },
});
```

With `cartPolicy` set:

- A body `country` outside `allowedCountries` is replaced by `defaults.country`.
- A new cart is created in `currencyByCountry[country]`; when the country has no mapping, in `defaults.currency`. A body `currency` that differs is ignored. commercetools cannot change the currency of an existing cart, so later adds keep the cart's currency.
- `POST /cart/addresses`, `POST /cart/payment` and `POST /cart/order` reject, with 400 `VALIDATION`, a shipping country outside `allowedCountries`, and a shipping country whose `currencyByCountry` entry differs from the cart currency (for example an EUR cart shipped to `CH` when the policy maps `CH` to `CHF`). The shopper then needs a new cart in the right currency.

What the policy guarantees: an order or payment is only created when the shipping country is allowed and, if mapped, the cart is priced in that country's currency. Without `currencyByCountry` entries the currency is not checked against the shipping country. Hosts without `cartPolicy` get no country or currency checks.

Independently of `cartPolicy`, `POST /cart/addresses` sets the cart country to the shipping address country (Carts `setCountry`), and `POST /cart/payment` and `POST /cart/order` re-apply it before the amount is fixed (a later add can switch the cart country back), so prices always follow the shipping country. If a cart item has no price for that country the request fails with 400 `MISSING_PRICE`; when an add to an existing cart fails because the requested country has no price and the cart already has a country, the server retries once without changing that country, and it never unsets the country, because commercetools already falls back to prices without a country when a country is set. An authorized payment whose amount no longer matches the re-priced total blocks the order with `CHECKOUT_INCOMPLETE`.

## Payments

The library does not bundle a PSP. Hosts inject a `PaymentProvider` on `CommerceAIConfig.payments.provider`. The server creates a commercetools Payment (Authorization transaction), links it to the Cart with `addPayment`, then creates the Order. When the cart carries a successful charge or authorization, the Order is created with `paymentState` (`Paid` or `Pending`) in the same request, so the state returned to the shopper is the one commercetools stored. The `CheckoutGateway` interface (from `@commerce-ai-tool/core/internal`, no semver guarantee; hosts cannot inject a gateway, the commercetools client implements it) forwards the optional `paymentState` argument of `createOrderFromCart` into the `OrderFromCartDraft`. `CheckoutGateway.updateOrder` was removed in 3.0.0. Dummy successful charges do not belong in the library — the demo app ships a mock adapter only.

```ts
import type { PaymentProvider } from "@commerce-ai-tool/core";
import { createNextHandlers, loadConfigFromEnv } from "@commerce-ai-tool/server";

const stripe: PaymentProvider = {
  paymentInterface: "STRIPE",
  listMethods: async () => [{ method: "CREDIT_CARD", name: "Credit card" }],
  authorize: async (request) => {
    // Call your PSP, return { status, interfaceId }
    return { status: "authorized", interfaceId: "pi_..." };
  },
};

const handlers = createNextHandlers({
  ...loadConfigFromEnv(),
  payments: { provider: stripe },
});
```

Set `CAT_PAYMENT_REQUIRED=true` (or omit it when a provider is set) to block `POST /cart/order` without a successful authorization. `requiredForOrder: false` keeps v2.0 behavior for hosts that are not ready to charge.
