---
"@commerce-ai-tool/core": patch
"@commerce-ai-tool/server": patch
"@commerce-ai-tool/react": patch
"@commerce-ai-tool/angular": patch
---

Order and cart correctness. `POST /cart/order` now sends `paymentState` (`Paid` or `Pending`) in the order draft instead of a follow-up `changePaymentState` update whose failure was swallowed, so the returned state is the persisted one. `CheckoutGateway.updateOrder` is no longer called by core; custom `createOrderFromCart` implementations must forward the new optional `paymentState` argument into the `OrderFromCartDraft`. A client `cartId` whose cart is `Ordered`, `Merged` or `Frozen` is no longer modified: adds fall back to the identity's active cart (creating one when none exists), while remove and quantity changes return 404 `CART_NOT_FOUND`. A missing line-item price (`MatchingPriceNotFound`) returns 400 `MISSING_PRICE` after at most one retry that keeps the cart's existing country (only when it has one); the country is never unset.
