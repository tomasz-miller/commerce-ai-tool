import { useCallback, useEffect, useRef, useState } from "react";
import {
  ANONYMOUS_ID_STORAGE_KEY,
  CommerceAIApiError,
  CUSTOMER_SESSION_STORAGE_KEY,
  CUSTOMER_STORAGE_KEY,
  createCommerceAIApiClient,
  createRandomUuid,
  getSharedCartSessionStore,
  messageForError,
  type CartSnapshot,
  type CartSyncMember,
  type CheckoutAddress,
  type CommerceAISearchMessages,
  type CustomerSnapshot,
  type OrderSnapshot,
  type PaymentMethodOption,
  type PaymentSnapshot,
  type ShippingMethodSnapshot,
} from "@commerce-ai-tool/core/client";
import { useLatestRef, useMessagesRef } from "./useLatestRef.js";

export { ANONYMOUS_ID_STORAGE_KEY, CUSTOMER_SESSION_STORAGE_KEY, CUSTOMER_STORAGE_KEY };

export interface AddToCartItem {
  sku?: string;
  productId?: string;
  variantId?: number;
  quantity?: number;
}

export interface UseCartOptions {
  apiBaseUrl: string;
  currency?: string;
  country?: string;
  catalogLocale?: string;
  /** When false, skip network calls. Default true for standalone hook usage. */
  enabled?: boolean;
  /** Host message overrides. `error` is always taken from these, never from the server's text. */
  messages?: Partial<CommerceAISearchMessages>;
  onCartChange?: (cart: CartSnapshot | null) => void;
}

export interface UseCartReturn {
  cart: CartSnapshot | null;
  anonymousId: string;
  customer: CustomerSnapshot | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isMutating: boolean;
  isLoggingIn: boolean;
  error: string | null;
  isCartOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  toggleCart: () => void;
  addToCart: (item: AddToCartItem) => Promise<CartSnapshot | null>;
  addItems: (items: AddToCartItem[]) => Promise<CartSnapshot | null>;
  removeFromCart: (lineItemId: string) => Promise<CartSnapshot | null>;
  updateQuantity: (lineItemId: string, quantity: number) => Promise<CartSnapshot | null>;
  setAddresses: (
    shippingAddress: CheckoutAddress,
    billingAddress?: CheckoutAddress,
  ) => Promise<CartSnapshot | null>;
  /** Returns matching methods, or `null` when the request failed. */
  getShippingMethods: () => Promise<ShippingMethodSnapshot[] | null>;
  setShippingMethod: (shippingMethodId: string) => Promise<CartSnapshot | null>;
  /** Returns matching methods, or `null` when the request failed. */
  getPaymentMethods: () => Promise<PaymentMethodOption[] | null>;
  authorizePayment: (method: string) => Promise<PaymentSnapshot | null>;
  getOrder: (orderNumber: string) => Promise<OrderSnapshot | null>;
  listOrders: () => Promise<OrderSnapshot[]>;
  placeOrder: () => Promise<OrderSnapshot | null>;
  login: (input: { email: string; password: string }) => Promise<CartSnapshot | null>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

/** UUID v4 from Web Crypto (`randomUUID`, else `getRandomValues` outside secure contexts). */
export function createAnonymousId(): string {
  return createRandomUuid();
}

/** The server rejected the customer session token (expired, revoked or unknown). */
function isSessionRejected(error: unknown): boolean {
  return error instanceof CommerceAIApiError && error.status === 401;
}

type MessageKey = keyof CommerceAISearchMessages;

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

export function useCart(options: UseCartOptions): UseCartReturn {
  const {
    apiBaseUrl,
    currency,
    country,
    catalogLocale,
    enabled = true,
    messages,
    onCartChange,
  } = options;

  const [anonymousId, setAnonymousId] = useState("");
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [customer, setCustomer] = useState<CustomerSnapshot | null>(null);
  const [cart, setCart] = useState<CartSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const onCartChangeRef = useLatestRef(onCartChange);
  const messagesRef = useMessagesRef(messages);
  const cartRef = useRef<CartSnapshot | null>(null);
  const sessionTokenRef = useRef<string | null>(null);
  const syncMemberRef = useRef<CartSyncMember | null>(null);
  const orderNumberRef = useRef<string | null>(null);
  // One store per page in the browser: every hook and widget on it shares the guest id, the
  // mutation queue and the cart sync bus.
  const [store] = useState(getSharedCartSessionStore);

  // Built on demand (event handlers and effects only): the client reads the session token from
  // a ref, which must not be touched while rendering.
  const getClient = useCallback(
    () =>
      createCommerceAIApiClient({
        baseUrl: apiBaseUrl,
        getSessionToken: () => sessionTokenRef.current,
        getAnonymousId: () => store.getAnonymousId(),
      }),
    [apiBaseUrl, store],
  );

  const failure = useCallback(
    (err: unknown, fallback: MessageKey) =>
      messageForError(err, messagesRef.current, { fallback }),
    [messagesRef],
  );

  const applyCart = useCallback(
    (next: CartSnapshot | null, sync = true) => {
      if (store.isStaleCartSnapshot(cartRef.current, next)) {
        return;
      }
      cartRef.current = next;
      setCart(next);
      onCartChangeRef.current?.(next);
      if (sync) {
        syncMemberRef.current?.emit(next);
      }
    },
    [onCartChangeRef, store],
  );

  const persistSession = useCallback(
    (token: string, nextCustomer: CustomerSnapshot) => {
      sessionTokenRef.current = token;
      setSessionToken(token);
      setCustomer(nextCustomer);
      store.saveSession(token, nextCustomer);
    },
    [store],
  );

  const clearSession = useCallback(() => {
    sessionTokenRef.current = null;
    setSessionToken(null);
    setCustomer(null);
    store.clearSession();
  }, [store]);

  /** Drops an expired customer session and starts over as a new guest. */
  const resetToGuest = useCallback(() => {
    clearSession();
    setAnonymousId(store.rotateAnonymousId());
    applyCart(null);
  }, [applyCart, clearSession, store]);

  const refresh = useCallback(async () => {
    if (!enabled || !anonymousId) {
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const body = await getClient().cart.get({ catalogLocale });
      applyCart(body.cart ?? null);
    } catch (err) {
      if (isSessionRejected(err) && sessionTokenRef.current) {
        resetToGuest();
      }
      setError(failure(err, "cartLoadFailed"));
    } finally {
      setIsLoading(false);
    }
  }, [anonymousId, applyCart, catalogLocale, getClient, enabled, failure, resetToGuest]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only hydration from storage; reading it during render would break SSR markup
    setAnonymousId(store.getAnonymousId());
    const session = store.readSession();
    if (session) {
      sessionTokenRef.current = session.token;
      setSessionToken(session.token);
      setCustomer(session.customer);
    }
  }, [enabled, store]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const member = store.joinSync((next) => applyCart(next, false));
    syncMemberRef.current = member;
    return () => {
      member.leave();
      syncMemberRef.current = null;
    };
  }, [applyCart, enabled, store]);

  useEffect(() => {
    if (!enabled || !anonymousId) {
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refresh() starts a fetch and toggles loading state on mount and whenever its inputs change
    void refresh();
  }, [anonymousId, enabled, refresh]);

  /**
   * Runs one cart mutation behind the shared queue, so it sees the cart version its predecessor
   * produced. `call` is invoked when its turn comes: the cart id and version are read then, the
   * other context fields are the values from when the mutation was queued.
   */
  const mutate = useCallback(
    async (
      call: (context: CartMutationContext) => Promise<{ cart: CartSnapshot | null }>,
      fallback: MessageKey = "checkoutFailed",
    ): Promise<CartSnapshot | null> => {
      if (!enabled || !anonymousId) {
        return null;
      }

      return store.enqueueMutation(async (): Promise<CartSnapshot | null> => {
        setIsMutating(true);
        setError(null);
        try {
          const next = await call({
            currency,
            country,
            catalogLocale,
            cartId: cartRef.current?.id,
          });
          applyCart(next.cart ?? null);
          return next.cart ?? null;
        } catch (err) {
          if (isSessionRejected(err) && sessionTokenRef.current) {
            resetToGuest();
          }
          setError(failure(err, fallback));
          return null;
        } finally {
          setIsMutating(false);
        }
      });
    },
    [anonymousId, applyCart, catalogLocale, country, currency, enabled, failure, resetToGuest, store],
  );

  const addToCart = useCallback(
    async (item: AddToCartItem) =>
      mutate(
        (context) =>
          getClient().cart.add({
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
      ),
    [getClient, mutate],
  );

  const addItems = useCallback(
    async (items: AddToCartItem[]) =>
      mutate(
        (context) =>
          getClient().cart.addItems({
            items,
            currency: context.currency,
            country: context.country,
            catalogLocale: context.catalogLocale,
            cartId: context.cartId,
          }),
        "unableToAddToCart",
      ),
    [getClient, mutate],
  );

  const removeFromCart = useCallback(
    (lineItemId: string) =>
      mutate((context) =>
        getClient().cart.remove({
          lineItemId,
          catalogLocale: context.catalogLocale,
          cartId: context.cartId,
        }),
      ),
    [getClient, mutate],
  );

  const updateQuantity = useCallback(
    (lineItemId: string, quantity: number) =>
      mutate((context) =>
        getClient().cart.updateQuantity({
          lineItemId,
          quantity,
          catalogLocale: context.catalogLocale,
          cartId: context.cartId,
        }),
      ),
    [getClient, mutate],
  );

  const setAddresses = useCallback(
    (shippingAddress: CheckoutAddress, billingAddress?: CheckoutAddress) =>
      mutate((context) =>
        getClient().cart.addresses({
          shippingAddress,
          billingAddress,
          catalogLocale: context.catalogLocale,
          cartId: context.cartId,
        }),
      ),
    [getClient, mutate],
  );

  const getShippingMethods = useCallback(async (): Promise<ShippingMethodSnapshot[] | null> => {
    if (!enabled || !anonymousId) {
      return [];
    }

    setIsMutating(true);
    setError(null);
    try {
      const body = await getClient().cart.shippingMethods({
        cartId: cartRef.current?.id,
        catalogLocale,
      });
      return body.shippingMethods ?? [];
    } catch (err) {
      setError(failure(err, "checkoutFailed"));
      return null;
    } finally {
      setIsMutating(false);
    }
  }, [anonymousId, catalogLocale, getClient, enabled, failure]);

  const setShippingMethod = useCallback(
    (shippingMethodId: string) =>
      mutate((context) =>
        getClient().cart.setShippingMethod({
          shippingMethodId,
          catalogLocale: context.catalogLocale,
          cartId: context.cartId,
        }),
      ),
    [getClient, mutate],
  );

  const getPaymentMethods = useCallback(async (): Promise<PaymentMethodOption[] | null> => {
    if (!enabled || !anonymousId) {
      return [];
    }

    setIsMutating(true);
    setError(null);
    try {
      const body = await getClient().cart.paymentMethods({
        cartId: cartRef.current?.id,
        catalogLocale,
      });
      return body.paymentMethods ?? [];
    } catch (err) {
      setError(failure(err, "checkoutFailed"));
      return null;
    } finally {
      setIsMutating(false);
    }
  }, [anonymousId, catalogLocale, getClient, enabled, failure]);

  const authorizePayment = useCallback(
    async (method: string): Promise<PaymentSnapshot | null> => {
      if (!enabled || !anonymousId) {
        return null;
      }

      return store.enqueueMutation(async (): Promise<PaymentSnapshot | null> => {
        orderNumberRef.current ??= `cat-${createAnonymousId()}`;
        setIsMutating(true);
        setError(null);
        try {
          const body = await getClient().cart.pay({
            cartId: cartRef.current?.id,
            catalogLocale,
            method,
            orderNumber: orderNumberRef.current,
          });
          if (body.cart) {
            applyCart(body.cart);
          }
          if (!body.payment) {
            throw new Error("Payment response is missing");
          }
          return body.payment;
        } catch (err) {
          setError(failure(err, "checkoutFailed"));
          return null;
        } finally {
          setIsMutating(false);
        }
      });
    },
    [anonymousId, applyCart, catalogLocale, getClient, enabled, failure, store],
  );

  const getOrder = useCallback(
    async (orderNumber: string): Promise<OrderSnapshot | null> => {
      const trimmed = orderNumber.trim();
      if (!enabled || !anonymousId || !trimmed) {
        return null;
      }

      setIsLoading(true);
      setError(null);
      try {
        const body = await getClient().orders.get({ orderNumber: trimmed, catalogLocale });
        return body.order ?? null;
      } catch (err) {
        setError(failure(err, "orderNotFound"));
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [anonymousId, catalogLocale, getClient, enabled, failure],
  );

  const listOrders = useCallback(async (): Promise<OrderSnapshot[]> => {
    if (!enabled || !anonymousId) {
      return [];
    }

    setIsLoading(true);
    setError(null);
    try {
      const body = await getClient().orders.list({ catalogLocale });
      return body.orders ?? [];
    } catch (err) {
      setError(failure(err, "orderNotFound"));
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [anonymousId, catalogLocale, getClient, enabled, failure]);

  const placeOrder = useCallback(async (): Promise<OrderSnapshot | null> => {
    if (!enabled || !anonymousId) {
      return null;
    }

    return store.enqueueMutation(async (): Promise<OrderSnapshot | null> => {
      const currentCart = cartRef.current;
      if (!currentCart) {
        return null;
      }
      orderNumberRef.current ??= `cat-${createAnonymousId()}`;
      setIsMutating(true);
      setError(null);
      try {
        const body = await getClient().cart.order({
          cartId: currentCart.id,
          catalogLocale,
          orderNumber: orderNumberRef.current,
        });
        if (!body.order) {
          throw new Error("Order response is missing");
        }
        orderNumberRef.current = null;
        applyCart(null);
        return body.order;
      } catch (err) {
        setError(failure(err, "checkoutFailed"));
        return null;
      } finally {
        setIsMutating(false);
      }
    });
  }, [anonymousId, applyCart, catalogLocale, getClient, enabled, failure, store]);

  const login = useCallback(
    async (input: { email: string; password: string }) => {
      if (!enabled) {
        return null;
      }

      setIsLoggingIn(true);
      setError(null);
      try {
        const body = await getClient().cart.login({
          email: input.email,
          password: input.password,
          catalogLocale,
          cartId: cartRef.current?.id,
        });
        if (!body.sessionToken || !body.customer) {
          throw new Error("Sign in response is missing");
        }
        persistSession(body.sessionToken, body.customer);
        applyCart(body.cart ?? null);
        return body.cart ?? null;
      } catch (err) {
        setError(failure(err, "signInFailed"));
        return null;
      } finally {
        setIsLoggingIn(false);
      }
    },
    [applyCart, catalogLocale, getClient, enabled, failure, persistSession],
  );

  const logout = useCallback(async () => {
    try {
      // The token lets the host run its `cartSession.onLogout` hook (for example a denylist).
      await getClient().cart.logout();
    } catch {
      // Client-side logout still proceeds if the network call fails.
    }
    resetToGuest();
  }, [getClient, resetToGuest]);

  const openCart = useCallback(() => {
    setIsCartOpen(true);
    // Re-fetch so the panel never shows a stale cart after a mutation
    // from another hook instance (for example host-owned add-to-cart UI).
    void refresh();
  }, [refresh]);
  const closeCart = useCallback(() => setIsCartOpen(false), []);
  // Reads the current state instead of a setState updater: updaters must be pure, and React
  // calls them twice in Strict Mode, which fired the refresh twice.
  const toggleCart = useCallback(() => {
    if (isCartOpen) {
      closeCart();
    } else {
      openCart();
    }
  }, [closeCart, isCartOpen, openCart]);

  return {
    cart,
    anonymousId,
    customer,
    isAuthenticated: Boolean(customer && sessionToken),
    isLoading,
    isMutating,
    isLoggingIn,
    error,
    isCartOpen,
    openCart,
    closeCart,
    toggleCart,
    addToCart,
    addItems,
    removeFromCart,
    updateQuantity,
    setAddresses,
    getShippingMethods,
    setShippingMethod,
    getPaymentMethods,
    authorizePayment,
    getOrder,
    listOrders,
    placeOrder,
    login,
    logout,
    refresh,
  };
}
