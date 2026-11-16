import { Injectable, computed, inject, signal, type OnDestroy } from "@angular/core";
import {
  CommerceAIApiError,
  createCommerceAIApiClient,
  getSharedCartSessionStore,
  messageForError,
  resolveCommerceAISearchMessages,
  type CartSnapshot,
  type CartSyncMember,
  type CommerceAIApiClient,
  type CommerceAISearchMessages,
  type CustomerSnapshot,
} from "@commerce-ai-tool/core/client";
import { COMMERCE_AI_FETCH } from "./commerce-ai-fetch.token";

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
  /** Host message overrides. `error` is always taken from these, never from the server's text. */
  messages?: Partial<CommerceAISearchMessages>;
  onCartChange?: (cart: CartSnapshot | null) => void;
}

type MessageKey = keyof CommerceAISearchMessages;

/** The server rejected the customer session token (expired, revoked or unknown). */
function isSessionRejected(error: unknown): boolean {
  return error instanceof CommerceAIApiError && error.status === 401;
}

/**
 * Request fields of a cart mutation. `currency`, `country` and `catalogLocale` are captured when
 * the mutation is queued; only `cartId` is read when it runs, from the cart its
 * predecessor produced.
 */
interface CartMutationContext {
  currency?: string;
  country?: string;
  catalogLocale?: string;
  cartId?: string;
}

/**
 * Cart state of one widget instance. Identity, the mutation queue and the cross-instance sync
 * live in the page-wide store of `@commerce-ai-tool/core/client`, shared with the React hook and
 * with host code, so instances on one page show one cart. State is exposed as signals, which
 * keeps the widget correct in zoneless and `OnPush` hosts.
 */
@Injectable()
export class CommerceAiCartService implements OnDestroy {
  readonly cart = signal<CartSnapshot | null>(null);
  readonly anonymousId = signal("");
  readonly customer = signal<CustomerSnapshot | null>(null);
  readonly isLoading = signal(false);
  readonly isMutating = signal(false);
  readonly isLoggingIn = signal(false);
  readonly error = signal<string | null>(null);
  readonly isCartOpen = signal(false);
  private readonly sessionTokenSignal = signal<string | null>(null);
  readonly isAuthenticated = computed(() => Boolean(this.customer() && this.sessionTokenSignal()));

  private apiBaseUrl = "";
  private currency?: string;
  private country?: string;
  private catalogLocale?: string;
  private messages?: Partial<CommerceAISearchMessages>;
  private enabled = false;
  private onCartChange?: (cart: CartSnapshot | null) => void;
  private sessionTokenValue: string | null = null;
  private cartValue: CartSnapshot | null = null;
  private started = false;
  private syncMember: CartSyncMember | null = null;
  private readonly store = getSharedCartSessionStore();
  private readonly fetch = inject(COMMERCE_AI_FETCH);

  ngOnDestroy(): void {
    this.syncMember?.leave();
    this.syncMember = null;
  }

  sessionToken(): string | null {
    return this.sessionTokenValue;
  }

  configure(options: CommerceAiCartOptions): void {
    this.apiBaseUrl = options.apiBaseUrl.replace(/\/$/, "");
    this.currency = options.currency;
    this.country = options.country;
    this.catalogLocale = options.catalogLocale;
    this.messages = options.messages;
    this.enabled = options.enabled !== false;
    this.onCartChange = options.onCartChange;

    if (!this.enabled) {
      this.syncMember?.leave();
      this.syncMember = null;
      return;
    }

    this.syncMember ??= this.store.joinSync((next) => this.applyCart(next, false));

    if (!this.started) {
      this.started = true;
      this.anonymousId.set(this.store.getAnonymousId());
      const session = this.store.readSession();
      if (session) {
        this.sessionTokenValue = session.token;
        this.sessionTokenSignal.set(session.token);
        this.customer.set(session.customer);
      }
      void this.refresh();
    }
  }

  openCart(): void {
    this.isCartOpen.set(true);
    // Re-fetch so the panel never shows a stale cart after a mutation from another instance
    // (for example host-owned add-to-cart UI).
    void this.refresh();
  }

  closeCart(): void {
    this.isCartOpen.set(false);
  }

  toggleCart(): void {
    if (this.isCartOpen()) {
      this.closeCart();
    } else {
      this.openCart();
    }
  }

  async refresh(): Promise<void> {
    if (!this.enabled || !this.anonymousId()) {
      return;
    }

    this.isLoading.set(true);
    this.error.set(null);
    try {
      const body = await this.client().cart.get({ catalogLocale: this.catalogLocale });
      this.applyCart(body.cart ?? null);
    } catch (err) {
      if (isSessionRejected(err) && this.sessionTokenValue) {
        this.resetToGuest();
        this.error.set(this.failure(err, "cartLoadFailed"));
        this.isLoading.set(false);
        await this.refresh();
        return;
      }
      this.error.set(this.failure(err, "cartLoadFailed"));
    } finally {
      this.isLoading.set(false);
    }
  }

  addToCart(item: AddToCartItem): Promise<CartSnapshot | null> {
    return this.mutate(
      (client, context) =>
        client.cart.add({
          sku: item.sku,
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
          currency: context.currency,
          country: context.country,
          catalogLocale: context.catalogLocale,
          cartId: context.cartId,
        }),
      "unableToAddToCart",
    );
  }

  addItems(items: AddToCartItem[]): Promise<CartSnapshot | null> {
    return this.mutate(
      (client, context) =>
        client.cart.addItems({
          items,
          currency: context.currency,
          country: context.country,
          catalogLocale: context.catalogLocale,
          cartId: context.cartId,
        }),
      "unableToAddToCart",
    );
  }

  removeFromCart(lineItemId: string): Promise<CartSnapshot | null> {
    return this.mutate((client, context) =>
      client.cart.remove({
        lineItemId,
        catalogLocale: context.catalogLocale,
        cartId: context.cartId,
      }),
    );
  }

  updateQuantity(lineItemId: string, quantity: number): Promise<CartSnapshot | null> {
    return this.mutate((client, context) =>
      client.cart.updateQuantity({
        lineItemId,
        quantity,
        catalogLocale: context.catalogLocale,
        cartId: context.cartId,
      }),
    );
  }

  async login(input: { email: string; password: string }): Promise<CartSnapshot | null> {
    if (!this.enabled) {
      return null;
    }

    this.isLoggingIn.set(true);
    this.error.set(null);
    try {
      const body = await this.client().cart.login({
        email: input.email,
        password: input.password,
        catalogLocale: this.catalogLocale,
        cartId: this.cartValue?.id,
      });
      if (!body.sessionToken || !body.customer) {
        throw new Error("Sign in response is missing");
      }
      this.persistSession(body.sessionToken, body.customer);
      this.applyCart(body.cart ?? null);
      return body.cart ?? null;
    } catch (err) {
      this.error.set(this.failure(err, "signInFailed"));
      return null;
    } finally {
      this.isLoggingIn.set(false);
    }
  }

  async logout(): Promise<void> {
    try {
      // The token lets the host run its `cartSession.onLogout` hook (for example a denylist).
      await this.client().cart.logout();
    } catch {
      // Client-side logout still proceeds if the network call fails.
    }
    this.resetToGuest();
  }

  private client(): CommerceAIApiClient {
    return createCommerceAIApiClient({
      baseUrl: this.apiBaseUrl,
      fetch: this.fetch,
      getSessionToken: () => this.sessionTokenValue,
      getAnonymousId: () => this.anonymousId(),
    });
  }

  private failure(err: unknown, fallback: MessageKey): string {
    return messageForError(err, resolveCommerceAISearchMessages(this.messages), { fallback });
  }

  /**
   * Runs one cart mutation behind the page-wide queue, so it sees the cart version its
   * predecessor produced. `call` runs when its turn comes: the cart id and version are read then,
   * the other context fields are the values from when the mutation was queued.
   */
  private mutate(
    call: (
      client: CommerceAIApiClient,
      context: CartMutationContext,
    ) => Promise<{ cart: CartSnapshot | null }>,
    fallback: MessageKey = "checkoutFailed",
  ): Promise<CartSnapshot | null> {
    const captured = {
      currency: this.currency,
      country: this.country,
      catalogLocale: this.catalogLocale,
    };

    return this.store.enqueueMutation(async (): Promise<CartSnapshot | null> => {
      if (!this.enabled || !this.anonymousId()) {
        return null;
      }

      this.isMutating.set(true);
      this.error.set(null);
      try {
        const next = await call(this.client(), {
          ...captured,
          cartId: this.cartValue?.id,
        });
        this.applyCart(next.cart ?? null);
        return next.cart ?? null;
      } catch (err) {
        if (isSessionRejected(err) && this.sessionTokenValue) {
          this.resetToGuest();
        }
        this.error.set(this.failure(err, fallback));
        return null;
      } finally {
        this.isMutating.set(false);
      }
    });
  }

  private applyCart(next: CartSnapshot | null, sync = true): void {
    if (this.store.isStaleCartSnapshot(this.cartValue, next)) {
      return;
    }
    this.cartValue = next;
    this.cart.set(next);
    this.onCartChange?.(next);
    if (sync) {
      this.syncMember?.emit(next);
    }
  }

  private persistSession(token: string, nextCustomer: CustomerSnapshot): void {
    this.sessionTokenValue = token;
    this.sessionTokenSignal.set(token);
    this.customer.set(nextCustomer);
    this.store.saveSession(token, nextCustomer);
  }

  private clearSession(): void {
    this.sessionTokenValue = null;
    this.sessionTokenSignal.set(null);
    this.customer.set(null);
    this.store.clearSession();
  }

  /** Drops the customer session (logout, or a token the server rejected) and starts as a new guest. */
  private resetToGuest(): void {
    this.clearSession();
    this.anonymousId.set(this.store.rotateAnonymousId());
    this.applyCart(null);
  }
}
