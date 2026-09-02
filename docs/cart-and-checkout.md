# Cart and checkout

Opt-in cart, host-owned checkout, payments, and order lookup. Search remains usable without any of this.

[Documentation index](README.md) · [Getting started](getting-started.md)

## Cart levels

Cart is off by default so existing `onProductSelect` integrations stay unchanged. Product row clicks still fire `onProductSelect` (for example PDP navigation). Add-to-cart is a separate icon on the card.

| Level | How | UI |
|-------|-----|----|
| Off (default) | Omit `enableCart` | No cart icon, no add-to-cart buttons |
| Built-in | `enableCart` | Header cart badge, slide-over preview, add-to-cart on results |
| Custom | `useCart({ apiBaseUrl })` | Host app owns the cart UI; same `/cart` endpoints |

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

## Routes

Cart: `GET /cart`, `POST /cart/add`, `POST /cart/add-items`, `POST /cart/remove`, `POST /cart/update-quantity`, `POST /cart/login`, `POST /cart/logout`.

Checkout: `POST /cart/addresses`, `GET /cart/shipping-methods`, `POST /cart/shipping-method`, `GET /cart/payment-methods`, `POST /cart/payment`, `POST /cart/order`.

Orders: `GET /orders` lists recent orders for the current cart identity; `GET /orders?orderNumber=…` returns a single client-safe snapshot. After checkout, render `CommerceAIOrderStatus` on a host route (the demo uses `/orders?orderNumber=…`) for payment/shipment state and parcel tracking from commercetools deliveries.

The commercetools project must have a Shipping Method with a Zone matching the checkout country. When no matching shipping methods exist, checkout still allows placing the order after a successful address step. When no payment provider is configured, `GET /cart/payment-methods` returns an empty list and checkout skips the payment step.

Order creation and payment authorization are rate-limited (20 attempts per 15 minutes per IP on the Express router; Next handlers use the same in-memory cap). Login is rate-limited (10 attempts per 15 minutes per IP).

## Session identity

- **Guest** — `anonymousId` in `localStorage` (`commerce-ai-tool:anonymousId`). The server looks up the Active cart by `anonymousId`.
- **Customer** — HMAC session token (`commerce-ai-tool:customerSession`) signed with `CAT_CART_SESSION_SECRET` (falls back to `CTP_CLIENT_SECRET`). A valid token wins over `anonymousId`. `GET /cart` sends it as `x-commerce-ai-cart-session` (never as a query parameter); mutations send `sessionToken` in the JSON body.
- **Login** — commercetools `POST /{projectKey}/login` with `anonymousCartSignInMode: MergeWithExistingCustomerCart`. A client `cartId` is merged only after the cart is loaded and `cart.anonymousId` matches the request `anonymousId`. Passwords are never logged or sent to Langfuse. Catalog `storeKey` is not applied to login (cart CRUD is project-scoped). Manual testing needs a Customer account in the project (do not commit passwords).
- **Logout** — token is dropped and a new guest `anonymousId` is created (stateless `POST /cart/logout`).
- **Batch add** — `POST /cart/add-items` adds 1–20 line items in one Cart update (mission “Add all”, first product per filled lane at quantity 1). Per-card add uses `POST /cart/add`.

## Payments

The library does not bundle a PSP. Hosts inject a `PaymentProvider` on `CommerceAIConfig.payments.provider`. The server creates a commercetools Payment (Authorization transaction), links it to the Cart with `addPayment`, then creates the Order. Dummy successful charges do not belong in the library — the demo app ships a mock adapter only.

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
