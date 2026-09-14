import { Injectable, signal } from "@angular/core";
import {
  CART_SESSION_HEADER,
  type CartSnapshot,
  type CheckoutAddress,
  type OrderSnapshot,
  type PaymentMethodOption,
  type PaymentSnapshot,
  type ShippingMethodSnapshot,
} from "@commerce-ai-tool/core/client";
import { CartSessionStore, createAnonymousId } from "./cart-session.store.js";
import type { CartApiEnvelope, CheckoutServiceOptions } from "./api.models.js";

export class CheckoutRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "CheckoutRequestError";
    this.status = status;
  }
}

async function parseEnvelope(response: Response): Promise<CartApiEnvelope> {
  const body = (await response.json()) as CartApiEnvelope;
  if (!response.ok) {
    throw new CheckoutRequestError(body.error ?? "Checkout request failed", response.status);
  }
  return body;
}

/**
 * Host-owned checkout HTTP client. Covers the BFF surface the widget cart
 * service does not expose: addresses, shipping methods, payment methods,
 * payment authorization, order placement, and order lookup.
 */
@Injectable({ providedIn: "root" })
export class CheckoutApiService {
  readonly cart = signal<CartSnapshot | null>(null);
  readonly anonymousId = signal("");
  readonly isLoading = signal(false);
  readonly isMutating = signal(false);
  readonly error = signal<string | null>(null);

  private apiBaseUrl = "";
  private currency?: string;
  private country?: string;
  private catalogLocale?: string;
  private orderNumber: string | null = null;
  private mutationChain: Promise<unknown> = Promise.resolve();

  constructor(private readonly sessions: CartSessionStore) {}

  configure(options: CheckoutServiceOptions): void {
    this.apiBaseUrl = options.apiBaseUrl.replace(/\/$/, "");
    this.currency = options.currency;
    this.country = options.country;
    this.catalogLocale = options.catalogLocale;
    if (!this.anonymousId()) {
      this.anonymousId.set(this.sessions.getOrCreateAnonymousId());
    }
    void this.refresh();
  }

  async refresh(): Promise<void> {
    const anonymousId = this.anonymousId();
    if (!anonymousId) {
      return;
    }
    const params = new URLSearchParams();
    const headers: Record<string, string> = {};
    const token = this.sessions.readSessionToken();
    if (token) {
      headers[CART_SESSION_HEADER] = token;
    } else {
      params.set("anonymousId", anonymousId);
    }
    if (this.catalogLocale) {
      params.set("catalogLocale", this.catalogLocale);
    }

    this.isLoading.set(true);
    this.error.set(null);
    try {
      const query = params.toString();
      const response = await fetch(`${this.apiBaseUrl}/cart${query ? `?${query}` : ""}`, {
        headers,
      });
      const body = await parseEnvelope(response);
      this.cart.set(body.cart ?? null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : "Cart request failed");
    } finally {
      this.isLoading.set(false);
    }
  }

  setAddresses(
    shippingAddress: CheckoutAddress,
    billingAddress?: CheckoutAddress,
  ): Promise<CartSnapshot | null> {
    return this.mutate("/cart/addresses", { shippingAddress, billingAddress });
  }

  setShippingMethod(shippingMethodId: string): Promise<CartSnapshot | null> {
    return this.mutate("/cart/shipping-method", { shippingMethodId });
  }

  async getShippingMethods(): Promise<ShippingMethodSnapshot[] | null> {
    const params = this.checkoutQueryParams();
    if (!params) {
      return [];
    }
    this.isMutating.set(true);
    this.error.set(null);
    try {
      const response = await fetch(`${this.apiBaseUrl}/cart/shipping-methods?${params.toString()}`, {
        headers: this.sessionHeaders(),
      });
      const body = await parseEnvelope(response);
      return body.shippingMethods ?? [];
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : "Shipping methods request failed");
      return null;
    } finally {
      this.isMutating.set(false);
    }
  }

  async getPaymentMethods(): Promise<PaymentMethodOption[] | null> {
    const params = this.checkoutQueryParams();
    if (!params) {
      return [];
    }
    this.isMutating.set(true);
    this.error.set(null);
    try {
      const response = await fetch(`${this.apiBaseUrl}/cart/payment-methods?${params.toString()}`, {
        headers: this.sessionHeaders(),
      });
      const body = await parseEnvelope(response);
      return body.paymentMethods ?? [];
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : "Payment methods request failed");
      return null;
    } finally {
      this.isMutating.set(false);
    }
  }

  authorizePayment(method: string): Promise<PaymentSnapshot | null> {
    const run = async (): Promise<PaymentSnapshot | null> => {
      this.orderNumber ??= `cat-${createAnonymousId()}`;
      this.isMutating.set(true);
      this.error.set(null);
      try {
        const response = await fetch(`${this.apiBaseUrl}/cart/payment`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            anonymousId: this.anonymousId(),
            sessionToken: this.sessions.readSessionToken() ?? undefined,
            cartId: this.cart()?.id,
            catalogLocale: this.catalogLocale,
            method,
            orderNumber: this.orderNumber,
          }),
        });
        const body = await parseEnvelope(response);
        if (body.cart) {
          this.cart.set(body.cart);
        }
        if (!body.payment) {
          throw new CheckoutRequestError("Payment response is missing", response.status);
        }
        return body.payment;
      } catch (err) {
        this.error.set(err instanceof Error ? err.message : "Payment failed");
        return null;
      } finally {
        this.isMutating.set(false);
      }
    };
    return this.chain(run);
  }

  placeOrder(): Promise<OrderSnapshot | null> {
    const run = async (): Promise<OrderSnapshot | null> => {
      const current = this.cart();
      if (!current) {
        return null;
      }
      this.orderNumber ??= `cat-${createAnonymousId()}`;
      this.isMutating.set(true);
      this.error.set(null);
      try {
        const response = await fetch(`${this.apiBaseUrl}/cart/order`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            anonymousId: this.anonymousId(),
            sessionToken: this.sessions.readSessionToken() ?? undefined,
            cartId: current.id,
            catalogLocale: this.catalogLocale,
            orderNumber: this.orderNumber,
          }),
        });
        const body = await parseEnvelope(response);
        if (!body.order) {
          throw new CheckoutRequestError("Order response is missing", response.status);
        }
        this.orderNumber = null;
        this.cart.set(null);
        return body.order;
      } catch (err) {
        this.error.set(err instanceof Error ? err.message : "Checkout failed");
        return null;
      } finally {
        this.isMutating.set(false);
      }
    };
    return this.chain(run);
  }

  async getOrder(orderNumber: string): Promise<OrderSnapshot | null> {
    const trimmed = orderNumber.trim();
    if (!trimmed) {
      return null;
    }
    const params = new URLSearchParams({ anonymousId: this.anonymousId(), orderNumber: trimmed });
    if (this.catalogLocale) {
      params.set("catalogLocale", this.catalogLocale);
    }
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const response = await fetch(`${this.apiBaseUrl}/orders?${params.toString()}`, {
        headers: this.sessionHeaders(),
      });
      const body = await parseEnvelope(response);
      return body.order ?? null;
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : "Order request failed");
      return null;
    } finally {
      this.isLoading.set(false);
    }
  }

  async listOrders(): Promise<OrderSnapshot[]> {
    const params = new URLSearchParams({ anonymousId: this.anonymousId() });
    if (this.catalogLocale) {
      params.set("catalogLocale", this.catalogLocale);
    }
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const response = await fetch(`${this.apiBaseUrl}/orders?${params.toString()}`, {
        headers: this.sessionHeaders(),
      });
      const body = await parseEnvelope(response);
      return body.orders ?? [];
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : "Order request failed");
      return [];
    } finally {
      this.isLoading.set(false);
    }
  }

  private mutate(path: string, body: Record<string, unknown>): Promise<CartSnapshot | null> {
    const run = async (): Promise<CartSnapshot | null> => {
      const anonymousId = this.anonymousId();
      if (!anonymousId) {
        return null;
      }
      this.isMutating.set(true);
      this.error.set(null);
      try {
        const response = await fetch(`${this.apiBaseUrl}${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            anonymousId,
            sessionToken: this.sessions.readSessionToken() ?? undefined,
            currency: this.currency,
            country: this.country,
            catalogLocale: this.catalogLocale,
            cartId: this.cart()?.id,
            cartVersion: this.cart()?.version,
            ...body,
          }),
        });
        const next = await parseEnvelope(response);
        this.cart.set(next.cart ?? null);
        return next.cart ?? null;
      } catch (err) {
        this.error.set(err instanceof Error ? err.message : "Checkout request failed");
        return null;
      } finally {
        this.isMutating.set(false);
      }
    };
    return this.chain(run);
  }

  private chain<T>(run: () => Promise<T>): Promise<T> {
    const pending = this.mutationChain.then(run, run);
    this.mutationChain = pending.then(
      () => undefined,
      () => undefined,
    );
    return pending;
  }

  private sessionHeaders(): Record<string, string> {
    const token = this.sessions.readSessionToken();
    return token ? { [CART_SESSION_HEADER]: token } : {};
  }

  private checkoutQueryParams(): URLSearchParams | null {
    const anonymousId = this.anonymousId();
    if (!anonymousId) {
      return null;
    }
    const params = new URLSearchParams();
    const token = this.sessions.readSessionToken();
    if (!token) {
      params.set("anonymousId", anonymousId);
    }
    const cartId = this.cart()?.id;
    if (cartId) {
      params.set("cartId", cartId);
    }
    if (this.catalogLocale) {
      params.set("catalogLocale", this.catalogLocale);
    }
    return params;
  }
}
