import type { Cart, Payment, PaymentReference, Transaction } from "@commercetools/platform-sdk";
import type { PaymentSnapshot } from "../types/index.js";
import { formatMoney } from "./cart.js";

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

export async function resolveCartPaymentCoverage(
  cart: Cart,
  getPaymentById: (id: string) => Promise<Payment>,
): Promise<CartPaymentCoverage> {
  const refs = cart.paymentInfo?.payments ?? [];
  let sawSuccess = false;
  for (const ref of refs) {
    const expanded = resolveExpandedPayment(ref);
    const payment = expanded ?? (await getPaymentById(ref.id));
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

export async function resolveOrderPaymentState(
  cart: Cart,
  getPaymentById: (id: string) => Promise<Payment>,
): Promise<"Paid" | "Pending" | undefined> {
  const refs = cart.paymentInfo?.payments ?? [];
  let authorized = false;
  for (const ref of refs) {
    const expanded = resolveExpandedPayment(ref);
    const payment = expanded ?? (await getPaymentById(ref.id));
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
  if (!error || typeof error !== "object") {
    return undefined;
  }
  const candidate = error as {
    statusCode?: number;
    body?: { statusCode?: number; errors?: Array<{ code?: string }> };
  };
  return candidate.statusCode ?? candidate.body?.statusCode;
}

export function isDuplicateField(error: unknown): boolean {
  if (httpStatus(error) !== 400) {
    return false;
  }

  const candidate = error as { body?: { errors?: Array<{ code?: string }> } };
  return (
    candidate.body?.errors?.some(
      (item) => item.code === "DuplicateField" || item.code === "DuplicateFieldWithConflictingResource",
    ) ?? false
  );
}

export function isResourceNotFound(error: unknown): boolean {
  if (httpStatus(error) === 404) {
    return true;
  }
  const candidate = error as { body?: { errors?: Array<{ code?: string }> } };
  return candidate.body?.errors?.some((item) => item.code === "ResourceNotFound") ?? false;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (!error || typeof error !== "object") {
    return "";
  }
  const candidate = error as {
    message?: string;
    body?: { message?: string; errors?: Array<{ message?: string }> };
  };
  return [
    candidate.message,
    candidate.body?.message,
    ...(candidate.body?.errors?.map((item) => item.message) ?? []),
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

export function isAnonymousIdAlreadyUsed(error: unknown): boolean {
  if (httpStatus(error) !== 400) {
    return false;
  }
  return errorMessage(error).includes("already used for sign-in");
}
