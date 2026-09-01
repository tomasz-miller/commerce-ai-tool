import type { Cart, Payment, PaymentDraft } from "@commercetools/platform-sdk";
import type {
  AuthorizePaymentRequest,
  CartSnapshot,
  PaymentMethodOption,
  PaymentSnapshot,
} from "../types/index.js";
import type { PaymentProvider } from "../payments/types.js";
import {
  assertCartOwner,
  buildAnonymousCartWhere,
  buildCustomerCartWhere,
  CartNotFoundError,
  isConcurrentModification,
  mapCartToSnapshot,
  resolveCartLocale,
} from "./cart.js";
import { CheckoutIncompleteError, type CheckoutGateway } from "./checkout.js";
import {
  isAnonymousIdAlreadyUsed,
  isDuplicateField,
  isResourceNotFound,
  mapPaymentToSnapshot,
  paymentCoversCartTotal,
  paymentMatchesCartAmount,
  paymentOwnedByCart,
  resolveExpandedPayment,
} from "./payment-map.js";

const MAX_PAYMENT_ATTEMPTS = 10;

export interface PaymentGateway extends CheckoutGateway {
  createPayment(draft: PaymentDraft): Promise<Payment>;
  getPaymentById(id: string): Promise<Payment>;
  getPaymentByKey(key: string): Promise<Payment>;
}

export interface PaymentOperations {
  listPaymentMethods(context: {
    locale?: string;
    country?: string;
  }): Promise<PaymentMethodOption[]>;
  authorizePayment(
    input: AuthorizePaymentRequest,
  ): Promise<{ payment: PaymentSnapshot; cart: CartSnapshot }>;
}

export class PaymentDeclinedError extends Error {
  constructor(message = "Payment was declined") {
    super(message);
    this.name = "PaymentDeclinedError";
  }
}

export class PaymentNotConfiguredError extends Error {
  constructor(message = "Payment provider is not configured") {
    super(message);
    this.name = "PaymentNotConfiguredError";
  }
}

export function createPaymentKey(
  orderNumber: string,
  paymentInterface: string,
  cartId?: string,
  attempt = 1,
): string {
  const safeInterface = paymentInterface.replaceAll(/[^A-Za-z0-9_-]/g, "") || "psp";
  const safeCart = (cartId ?? "cart").replaceAll(/[^A-Za-z0-9_-]/g, "") || "cart";
  const base = `${orderNumber}-${safeCart}-${safeInterface}`;
  const key = attempt > 1 ? `${base}-${attempt}` : base;
  return key.slice(0, 256);
}

function transactionState(
  status: "authorized" | "pending" | "failed",
): "Success" | "Pending" | "Failure" {
  if (status === "authorized") {
    return "Success";
  }
  if (status === "failed") {
    return "Failure";
  }
  return "Pending";
}

function paymentDraftOwner(cart: Cart): Pick<PaymentDraft, "anonymousId" | "customer"> {
  if (cart.customerId) {
    return { customer: { typeId: "customer", id: cart.customerId } };
  }
  if (cart.anonymousId) {
    return { anonymousId: cart.anonymousId };
  }
  return {};
}

function isReusablePayment(payment: Payment, cart: Cart): boolean {
  if (!paymentOwnedByCart(payment, cart) || !paymentMatchesCartAmount(payment, cart)) {
    return false;
  }
  if (paymentCoversCartTotal(payment, cart)) {
    return true;
  }
  return payment.transactions.at(-1)?.state === "Pending";
}

export function createPaymentOperations(
  gateway: PaymentGateway,
  provider?: PaymentProvider,
): PaymentOperations {
  async function requireActiveCart(input: AuthorizePaymentRequest): Promise<Cart> {
    let cart: Cart | undefined;

    if (input.cartId) {
      cart = await gateway.getCartById(input.cartId);
      assertCartOwner(cart, input);
    } else if (input.customerId) {
      [cart] = await gateway.queryCarts(buildCustomerCartWhere(input.customerId));
    } else if (input.anonymousId) {
      [cart] = await gateway.queryCarts(buildAnonymousCartWhere(input.anonymousId));
    }

    if (!cart || cart.cartState !== "Active") {
      throw new CartNotFoundError();
    }
    return cart;
  }

  async function tryGetPaymentByKey(key: string): Promise<Payment | undefined> {
    try {
      return await gateway.getPaymentByKey(key);
    } catch (error) {
      if (isResourceNotFound(error)) {
        return undefined;
      }
      throw error;
    }
  }

  async function updateWithRetry(cart: Cart, paymentId: string): Promise<Cart> {
    if (cart.paymentInfo?.payments.some((ref) => ref.id === paymentId)) {
      return cart;
    }

    const actions = [
      {
        action: "addPayment" as const,
        payment: { typeId: "payment" as const, id: paymentId },
      },
    ];

    try {
      return await gateway.updateCart(cart.id, cart.version, actions);
    } catch (error) {
      if (!isConcurrentModification(error)) {
        throw error;
      }
      const latest = await gateway.getCartById(cart.id);
      assertCartOwner(latest, {
        anonymousId: cart.anonymousId,
        customerId: cart.customerId,
      });
      if (latest.paymentInfo?.payments.some((ref) => ref.id === paymentId)) {
        return latest;
      }
      return gateway.updateCart(latest.id, latest.version, actions);
    }
  }

  async function findReusableOnCart(cart: Cart): Promise<Payment | undefined> {
    for (const ref of cart.paymentInfo?.payments ?? []) {
      const expanded = resolveExpandedPayment(ref);
      const payment = expanded ?? (await gateway.getPaymentById(ref.id));
      if (isReusablePayment(payment, cart)) {
        return payment;
      }
    }
    return undefined;
  }

  async function resolvePaymentSlot(
    cart: Cart,
    orderNumber: string,
    paymentInterface: string,
  ): Promise<{ key: string; existing?: Payment }> {
    for (let attempt = 1; attempt <= MAX_PAYMENT_ATTEMPTS; attempt += 1) {
      const key = createPaymentKey(orderNumber, paymentInterface, cart.id, attempt);
      const existing = await tryGetPaymentByKey(key);
      if (!existing) {
        return { key };
      }
      if (isReusablePayment(existing, cart)) {
        return { key, existing };
      }
    }
    throw new CheckoutIncompleteError("Too many payment attempts for this order");
  }

  async function persistPayment(
    cart: Cart,
    draft: PaymentDraft,
    key: string,
  ): Promise<Payment> {
    try {
      return await gateway.createPayment(draft);
    } catch (error) {
      if (isAnonymousIdAlreadyUsed(error) && draft.anonymousId) {
        return persistPayment(cart, { ...draft, anonymousId: undefined }, key);
      }
      if (!isDuplicateField(error)) {
        throw error;
      }
      const existing = await gateway.getPaymentByKey(key);
      if (isReusablePayment(existing, cart)) {
        return existing;
      }
      throw error;
    }
  }

  return {
    async listPaymentMethods(context) {
      if (!provider) {
        return [];
      }
      return provider.listMethods({
        locale: resolveCartLocale(context.locale),
        country: context.country,
      });
    },

    async authorizePayment(input) {
      if (!provider) {
        throw new PaymentNotConfiguredError();
      }

      const cart = await requireActiveCart(input);
      if (cart.lineItems.length === 0) {
        throw new CheckoutIncompleteError("Cart is empty");
      }

      const locale = resolveCartLocale(input.catalogLocale);
      const orderNumber = input.orderNumber?.trim() || `cat-${globalThis.crypto.randomUUID()}`;
      const method = input.method.trim();

      const reusable = await findReusableOnCart(cart);
      const slot = reusable
        ? { key: reusable.key ?? createPaymentKey(orderNumber, provider.paymentInterface, cart.id), existing: reusable }
        : await resolvePaymentSlot(cart, orderNumber, provider.paymentInterface);

      if (slot.existing) {
        const updated = await updateWithRetry(cart, slot.existing.id);
        return {
          payment: mapPaymentToSnapshot(slot.existing, locale),
          cart: mapCartToSnapshot(updated, locale),
        };
      }

      const result = await provider.authorize({
        cartId: cart.id,
        orderNumber,
        method,
        amount: {
          centAmount: cart.totalPrice.centAmount,
          currencyCode: cart.totalPrice.currencyCode,
        },
        locale,
        country: cart.country ?? cart.shippingAddress?.country,
        email: cart.shippingAddress?.email ?? cart.customerEmail,
      });

      const payment = await persistPayment(
        cart,
        {
          key: slot.key,
          interfaceId: result.interfaceId,
          amountPlanned: {
            centAmount: cart.totalPrice.centAmount,
            currencyCode: cart.totalPrice.currencyCode,
          },
          paymentMethodInfo: {
            paymentInterface: provider.paymentInterface,
            method,
          },
          transactions: [
            {
              type: "Authorization",
              amount: {
                centAmount: cart.totalPrice.centAmount,
                currencyCode: cart.totalPrice.currencyCode,
              },
              state: transactionState(result.status),
              interactionId: result.interfaceId,
              timestamp: new Date().toISOString(),
            },
          ],
          ...paymentDraftOwner(cart),
        },
        slot.key,
      );

      const updated = await updateWithRetry(cart, payment.id);
      const snapshot = mapPaymentToSnapshot(payment, locale, result.clientData);

      if (result.status === "failed") {
        throw new PaymentDeclinedError(result.failureReason?.trim() || "Payment was declined");
      }

      return {
        payment: snapshot,
        cart: mapCartToSnapshot(updated, locale),
      };
    },
  };
}
