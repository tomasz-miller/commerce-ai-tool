import type { Cart, Payment, PaymentReference, Transaction } from "@commercetools/platform-sdk";
import type { PaymentSnapshot } from "../types/index.js";
import { formatMoney } from "./cart.js";
import { commercetoolsErrorParts } from "./sdk-error.js";

export function mapPaymentStatus(
  transactions: Transaction[] | undefined,
): PaymentSnapshot["status"] {
  const latest = transactions?.at(-1);
  if (!latest) {
    return "pending";
  }
  if (latest.state === "Success") {
    return "authorized";
  }
  if (latest.state === "Failure") {
    return "failed";
  }
  return "pending";
}

export function mapPaymentToSnapshot(
  payment: Payment,
  locale: string,
  clientData?: Record<string, string>,
): PaymentSnapshot {
  return {
    id: payment.id,
    key: payment.key,
    interfaceId: payment.interfaceId,
    paymentInterface: payment.paymentMethodInfo?.paymentInterface ?? "",
    method: payment.paymentMethodInfo?.method ?? "",
    status: mapPaymentStatus(payment.transactions),
    amount: formatMoney(payment.amountPlanned, locale),
    clientData,
  };
}

export function resolveExpandedPayment(
  ref: PaymentReference | Payment,
): Payment | undefined {
  if ("amountPlanned" in ref && "transactions" in ref) {
    return ref;
  }
  return "obj" in ref ? ref.obj : undefined;
}

export function paymentHasSuccessfulAuthorization(payment: Payment): boolean {
  return payment.transactions.some(
    (tx) =>
      (tx.type === "Authorization" || tx.type === "Charge") &&
      tx.state === "Success",
  );
}

export function paymentHasSuccessfulCharge(payment: Payment): boolean {
  return payment.transactions.some((tx) => tx.type === "Charge" && tx.state === "Success");
}

export function paymentMatchesCartAmount(payment: Payment, cart: Cart): boolean {
  return (
    payment.amountPlanned.centAmount === cart.totalPrice.centAmount &&
    payment.amountPlanned.currencyCode === cart.totalPrice.currencyCode
  );
}

export function paymentCoversCartTotal(payment: Payment, cart: Cart): boolean {
  return paymentHasSuccessfulAuthorization(payment) && paymentMatchesCartAmount(payment, cart);
}

export function paymentOwnedByCart(payment: Payment, cart: Cart): boolean {
  if (cart.customerId && payment.customer?.id === cart.customerId) {
    return true;
  }
  if (cart.anonymousId && payment.anonymousId === cart.anonymousId) {
    return true;
  }
  return false;
}

export function mapCartPayments(cart: Cart, locale: string): PaymentSnapshot[] | undefined {
  const refs = cart.paymentInfo?.payments ?? [];
  const mapped = refs.flatMap((ref) => {
    const payment = resolveExpandedPayment(ref);
    return payment ? [mapPaymentToSnapshot(payment, locale)] : [];
  });
  return mapped.length ? mapped : undefined;
}

export type CartPaymentCoverage = "ok" | "missing" | "mismatch";

/** Payments linked to the cart: expanded objects are used as is, the rest are fetched once. */
export async function loadCartPayments(
  cart: Cart,
  getPaymentById: (id: string) => Promise<Payment>,
): Promise<Payment[]> {
  const refs = cart.paymentInfo?.payments ?? [];
  return Promise.all(
    refs.map(async (ref) => resolveExpandedPayment(ref) ?? (await getPaymentById(ref.id))),
  );
}

export function resolveCartPaymentCoverage(payments: Payment[], cart: Cart): CartPaymentCoverage {
  let sawSuccess = false;
  for (const payment of payments) {
    if (!paymentHasSuccessfulAuthorization(payment)) {
      continue;
    }
    sawSuccess = true;
    if (paymentMatchesCartAmount(payment, cart)) {
      return "ok";
    }
  }
  return sawSuccess ? "mismatch" : "missing";
}

export function resolveOrderPaymentState(payments: Payment[]): "Paid" | "Pending" | undefined {
  let authorized = false;
  for (const payment of payments) {
    if (paymentHasSuccessfulCharge(payment)) {
      return "Paid";
    }
    if (paymentHasSuccessfulAuthorization(payment)) {
      authorized = true;
    }
  }
  return authorized ? "Pending" : undefined;
}

function httpStatus(error: unknown): number | undefined {
  return commercetoolsErrorParts(error).status;
}

export function isDuplicateField(error: unknown): boolean {
  const { status, codes } = commercetoolsErrorParts(error);
  if (status !== 400) {
    return false;
  }
  return codes.some(
    (code) => code === "DuplicateField" || code === "DuplicateFieldWithConflictingResource",
  );
}

export function isResourceNotFound(error: unknown): boolean {
  const { status, codes } = commercetoolsErrorParts(error);
  return status === 404 || codes.includes("ResourceNotFound");
}

function errorMessage(error: unknown): string {
  return commercetoolsErrorParts(error).messages.join(" ");
}

export function isAnonymousIdAlreadyUsed(error: unknown): boolean {
  if (httpStatus(error) !== 400) {
    return false;
  }
  return errorMessage(error).includes("already used for sign-in");
}
