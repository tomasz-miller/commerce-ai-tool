import { Injectable, computed, signal } from "@angular/core";
import {
  CART_SESSION_HEADER,
  type CartSnapshot,
  type CustomerSnapshot,
} from "@commerce-ai-tool/core/client";

export const ANONYMOUS_ID_STORAGE_KEY = "commerce-ai-tool:anonymousId";
export const CUSTOMER_SESSION_STORAGE_KEY = "commerce-ai-tool:customerSession";
export const CUSTOMER_STORAGE_KEY = "commerce-ai-tool:customer";

export interface AddToCartItem {
  sku?: string;
  productId?: string;
  variantId?: number;
  quantity?: number;
}

export interface CommerceAiCartOptions {
  apiBaseUrl: string;
  currency?: string;
  country?: string;
  catalogLocale?: string;
  enabled?: boolean;
  onCartChange?: (cart: CartSnapshot | null) => void;
}

interface CartApiBody {
  cart?: CartSnapshot | null;
  customer?: CustomerSnapshot | null;
  sessionToken?: string;
  error?: string;
}

function readStorage(key: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore quota / privacy mode failures — session still works in memory.
  }
}

function removeStorage(key: string): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore privacy mode failures.
  }
}

function readStoredCustomer(): CustomerSnapshot | null {
  const raw = readStorage(CUSTOMER_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as CustomerSnapshot;
    if (typeof parsed.id === "string" && typeof parsed.email === "string") {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

export function createAnonymousId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `anon-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getOrCreateAnonymousId(): string {
  const existing = readStorage(ANONYMOUS_ID_STORAGE_KEY);
  if (existing) {
    return existing;
  }
  const created = createAnonymousId();
  writeStorage(ANONYMOUS_ID_STORAGE_KEY, created);
  return created;
}

function rotateAnonymousId(): string {
  const created = createAnonymousId();
  writeStorage(ANONYMOUS_ID_STORAGE_KEY, created);
  return created;
}

class CartRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "CartRequestError";
    this.status = status;
  }
}

async function parseCartApi(response: Response): Promise<CartApiBody> {
  const body = (await response.json()) as CartApiBody;
  if (!response.ok) {
    throw new CartRequestError(body.error ?? "Cart request failed", response.status);
  }
  return body;
}

@Injectable()
export class CommerceAiCartService {
  readonly cart = signal<CartSnapshot | null>(null);
  readonly anonymousId = signal("");
  readonly customer = signal<CustomerSnapshot | null>(null);
  readonly isLoading = signal(false);
  readonly isMutating = signal(false);
  readonly isLoggingIn = signal(false);
  readonly error = signal<string | null>(null);
  readonly isCartOpen = signal(false);
  readonly isAuthenticated = computed(() => Boolean(this.customer() && this.sessionToken()));

  private apiBaseUrl = "";
  private currency?: string;
  private country?: string;
  private catalogLocale?: string;
  private enabled = false;
  private onCartChange?: (cart: CartSnapshot | null) => void;
  private sessionTokenValue: string | null = null;
  private cartValue: CartSnapshot | null = null;
  private mutationChain: Promise<unknown> = Promise.resolve();
  private started = false;

  sessionToken(): string | null {
    return this.sessionTokenValue;
  }

  configure(options: CommerceAiCartOptions): void {
    this.apiBaseUrl = options.apiBaseUrl.replace(/\/$/, "");
    this.currency = options.currency;
    this.country = options.country;
    this.catalogLocale = options.catalogLocale;
    this.enabled = options.enabled !== false;
    this.onCartChange = options.onCartChange;

    if (!this.enabled) {
      return;
    }

    if (!this.started) {
      this.started = true;
      this.anonymousId.set(getOrCreateAnonymousId());
      const storedToken = readStorage(CUSTOMER_SESSION_STORAGE_KEY);
      const storedCustomer = readStoredCustomer();
      if (storedToken && storedCustomer) {
        this.sessionTokenValue = storedToken;
        this.customer.set(storedCustomer);
      }
      void this.refresh();
    }
  }

  openCart(): void {
    this.isCartOpen.set(true);
  }

  closeCart(): void {
    this.isCartOpen.set(false);
  }

  toggleCart(): void {
    this.isCartOpen.update((open) => !open);
  }

  async refresh(): Promise<void> {
    const anonymousId = this.anonymousId();
    if (!this.enabled || !anonymousId) {
      return;
    }

    const params = new URLSearchParams();
    const headers: Record<string, string> = {};
    const token = this.sessionTokenValue;
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
      const url = `${this.apiBaseUrl}/cart${query ? `?${query}` : ""}`;
      const response = await (token ? fetch(url, { headers }) : fetch(url));
      const body = await parseCartApi(response);
      this.applyCart(body.cart ?? null);
    } catch (err) {
      if (err instanceof CartRequestError && err.status === 401 && this.sessionTokenValue) {
        this.clearSession();
        this.anonymousId.set(rotateAnonymousId());
        this.applyCart(null);
        this.error.set(err.message);
        this.isLoading.set(false);
        await this.refresh();
        return;
      }
      this.error.set(err instanceof Error ? err.message : "Cart request failed");
    } finally {
      this.isLoading.set(false);
    }
  }

  addToCart(item: AddToCartItem): Promise<CartSnapshot | null> {
    return this.mutate("/cart/add", {
      sku: item.sku,
      productId: item.productId,
      variantId: item.variantId,
      quantity: item.quantity,
    });
  }

  addItems(items: AddToCartItem[]): Promise<CartSnapshot | null> {
    return this.mutate("/cart/add-items", { items });
  }

  removeFromCart(lineItemId: string): Promise<CartSnapshot | null> {
    return this.mutate("/cart/remove", { lineItemId });
  }

  updateQuantity(lineItemId: string, quantity: number): Promise<CartSnapshot | null> {
    return this.mutate("/cart/update-quantity", { lineItemId, quantity });
  }

  async login(input: { email: string; password: string }): Promise<CartSnapshot | null> {
    if (!this.enabled) {
      return null;
    }

    this.isLoggingIn.set(true);
    this.error.set(null);
    try {
      const response = await fetch(`${this.apiBaseUrl}/cart/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: input.email,
          password: input.password,
          anonymousId: this.anonymousId(),
          catalogLocale: this.catalogLocale,
          cartId: this.cartValue?.id,
        }),
      });
      const body = await parseCartApi(response);
      if (!body.sessionToken || !body.customer) {
        throw new CartRequestError("Sign in failed", response.status);
      }
      this.persistSession(body.sessionToken, body.customer);
      this.applyCart(body.cart ?? null);
      return body.cart ?? null;
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : "Sign in failed");
      return null;
    } finally {
      this.isLoggingIn.set(false);
    }
  }

  async logout(): Promise<void> {
    try {
      await fetch(`${this.apiBaseUrl}/cart/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
    } catch {
      // Client-side logout still proceeds if the network call fails.
    }
    this.clearSession();
    this.applyCart(null);
    this.anonymousId.set(rotateAnonymousId());
  }

  private mutate(path: string, body: Record<string, unknown>): Promise<CartSnapshot | null> {
    const run = async (): Promise<CartSnapshot | null> => {
      const anonymousId = this.anonymousId();
      if (!this.enabled || !anonymousId) {
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
            sessionToken: this.sessionTokenValue ?? undefined,
            currency: this.currency,
            country: this.country,
            catalogLocale: this.catalogLocale,
            cartId: this.cartValue?.id,
            cartVersion: this.cartValue?.version,
            ...body,
          }),
        });
        const next = await parseCartApi(response);
        this.applyCart(next.cart ?? null);
        return next.cart ?? null;
      } catch (err) {
        if (err instanceof CartRequestError && err.status === 401 && this.sessionTokenValue) {
          this.clearSession();
          this.anonymousId.set(rotateAnonymousId());
          this.applyCart(null);
        }
        this.error.set(err instanceof Error ? err.message : "Cart request failed");
        return null;
      } finally {
        this.isMutating.set(false);
      }
    };

    const pending = this.mutationChain.then(run, run);
    this.mutationChain = pending.then(
      () => undefined,
      () => undefined,
    );
    return pending;
  }

  private applyCart(next: CartSnapshot | null): void {
    this.cartValue = next;
    this.cart.set(next);
    this.onCartChange?.(next);
  }

  private persistSession(token: string, nextCustomer: CustomerSnapshot): void {
    this.sessionTokenValue = token;
    this.customer.set(nextCustomer);
    writeStorage(CUSTOMER_SESSION_STORAGE_KEY, token);
    writeStorage(CUSTOMER_STORAGE_KEY, JSON.stringify(nextCustomer));
  }

  private clearSession(): void {
    this.sessionTokenValue = null;
    this.customer.set(null);
    removeStorage(CUSTOMER_SESSION_STORAGE_KEY);
    removeStorage(CUSTOMER_STORAGE_KEY);
  }
}
