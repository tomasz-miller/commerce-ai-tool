import { useCallback, useEffect, useRef, useState } from "react";
import {
  CART_SESSION_HEADER,
  type CartSnapshot,
  type CheckoutAddress,
  type CustomerSnapshot,
  type OrderSnapshot,
  type PaymentMethodOption,
  type PaymentSnapshot,
  type ShippingMethodSnapshot,
} from "@commerce-ai-tool/core";

export const ANONYMOUS_ID_STORAGE_KEY = "commerce-ai-tool:anonymousId";
export const CUSTOMER_SESSION_STORAGE_KEY = "commerce-ai-tool:customerSession";
export const CUSTOMER_STORAGE_KEY = "commerce-ai-tool:customer";

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

interface CartApiBody {
  cart?: CartSnapshot | null;
  customer?: CustomerSnapshot | null;
  sessionToken?: string;
  shippingMethods?: ShippingMethodSnapshot[];
  paymentMethods?: PaymentMethodOption[];
  payment?: PaymentSnapshot;
  order?: OrderSnapshot;
  orders?: OrderSnapshot[];
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

export function useCart(options: UseCartOptions): UseCartReturn {
  const {
    apiBaseUrl,
    currency,
    country,
    catalogLocale,
    enabled = true,
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
  const onCartChangeRef = useRef(onCartChange);
  onCartChangeRef.current = onCartChange;
  const cartRef = useRef<CartSnapshot | null>(null);
  const sessionTokenRef = useRef<string | null>(null);
  const mutationChainRef = useRef(Promise.resolve<unknown>(undefined));
  const orderNumberRef = useRef<string | null>(null);

  const applyCart = useCallback((next: CartSnapshot | null) => {
    cartRef.current = next;
    setCart(next);
    onCartChangeRef.current?.(next);
  }, []);

  const persistSession = useCallback((token: string, nextCustomer: CustomerSnapshot) => {
    sessionTokenRef.current = token;
    setSessionToken(token);
    setCustomer(nextCustomer);
    writeStorage(CUSTOMER_SESSION_STORAGE_KEY, token);
    writeStorage(CUSTOMER_STORAGE_KEY, JSON.stringify(nextCustomer));
  }, []);

  const clearSession = useCallback(() => {
    sessionTokenRef.current = null;
    setSessionToken(null);
    setCustomer(null);
    removeStorage(CUSTOMER_SESSION_STORAGE_KEY);
    removeStorage(CUSTOMER_STORAGE_KEY);
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled || !anonymousId) {
      return;
    }

    const params = new URLSearchParams();
    const headers: Record<string, string> = {};
    const token = sessionTokenRef.current;
    if (token) {
      headers[CART_SESSION_HEADER] = token;
    } else {
      params.set("anonymousId", anonymousId);
    }
    if (catalogLocale) {
      params.set("catalogLocale", catalogLocale);
    }

    setIsLoading(true);
    setError(null);
    try {
      const query = params.toString();
      const url = `${apiBaseUrl}/cart${query ? `?${query}` : ""}`;
      const response = await (token
        ? fetch(url, { headers })
        : fetch(url));
      const body = await parseCartApi(response);
      applyCart(body.cart ?? null);
    } catch (err) {
      if (err instanceof CartRequestError && err.status === 401 && sessionTokenRef.current) {
        clearSession();
        const nextAnonymousId = rotateAnonymousId();
        setAnonymousId(nextAnonymousId);
        applyCart(null);
      }
      setError(err instanceof Error ? err.message : "Cart request failed");
    } finally {
      setIsLoading(false);
    }
  }, [anonymousId, apiBaseUrl, applyCart, catalogLocale, clearSession, enabled]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    setAnonymousId(getOrCreateAnonymousId());
    const storedToken = readStorage(CUSTOMER_SESSION_STORAGE_KEY);
    const storedCustomer = readStoredCustomer();
    if (storedToken && storedCustomer) {
      sessionTokenRef.current = storedToken;
      setSessionToken(storedToken);
      setCustomer(storedCustomer);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !anonymousId) {
      return;
    }
    void refresh();
  }, [anonymousId, enabled, refresh]);

  const mutate = useCallback(
    async (path: string, body: Record<string, unknown>): Promise<CartSnapshot | null> => {
      if (!enabled || !anonymousId) {
        return null;
      }

      const run = async (): Promise<CartSnapshot | null> => {
        setIsMutating(true);
        setError(null);
        try {
          const response = await fetch(`${apiBaseUrl}${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              anonymousId,
              sessionToken: sessionTokenRef.current ?? undefined,
              currency,
              country,
              catalogLocale,
              cartId: cartRef.current?.id,
              cartVersion: cartRef.current?.version,
              ...body,
            }),
          });
          const next = await parseCartApi(response);
          applyCart(next.cart ?? null);
          return next.cart ?? null;
        } catch (err) {
          if (err instanceof CartRequestError && err.status === 401 && sessionTokenRef.current) {
            clearSession();
            setAnonymousId(rotateAnonymousId());
            applyCart(null);
          }
          setError(err instanceof Error ? err.message : "Cart request failed");
          return null;
        } finally {
          setIsMutating(false);
        }
      };

      const pending = mutationChainRef.current.then(run, run);
      mutationChainRef.current = pending.then(
        () => undefined,
        () => undefined,
      );
      return pending;
    },
    [anonymousId, apiBaseUrl, applyCart, catalogLocale, clearSession, country, currency, enabled],
  );

  const addToCart = useCallback(
    async (item: AddToCartItem) =>
      mutate("/cart/add", {
        sku: item.sku,
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
      }),
    [mutate],
  );

  const removeFromCart = useCallback(
    (lineItemId: string) => mutate("/cart/remove", { lineItemId }),
    [mutate],
  );

  const updateQuantity = useCallback(
    (lineItemId: string, quantity: number) =>
      mutate("/cart/update-quantity", { lineItemId, quantity }),
    [mutate],
  );

  const setAddresses = useCallback(
    (shippingAddress: CheckoutAddress, billingAddress?: CheckoutAddress) =>
      mutate("/cart/addresses", { shippingAddress, billingAddress }),
    [mutate],
  );

  const getShippingMethods = useCallback(async (): Promise<
    ShippingMethodSnapshot[] | null
  > => {
    if (!enabled || !anonymousId) {
      return [];
    }
    const params = new URLSearchParams();
    const headers: Record<string, string> = {};
    const token = sessionTokenRef.current;
    if (token) {
      headers[CART_SESSION_HEADER] = token;
    } else {
      params.set("anonymousId", anonymousId);
    }
    if (cartRef.current?.id) {
      params.set("cartId", cartRef.current.id);
    }
    if (catalogLocale) {
      params.set("catalogLocale", catalogLocale);
    }

    setIsMutating(true);
    setError(null);
    try {
      const response = await fetch(
        `${apiBaseUrl}/cart/shipping-methods?${params.toString()}`,
        token ? { headers } : undefined,
      );
      const body = await parseCartApi(response);
      return body.shippingMethods ?? [];
    } catch (err) {
      setError(err instanceof Error ? err.message : "Shipping methods request failed");
      return null;
    } finally {
      setIsMutating(false);
    }
  }, [anonymousId, apiBaseUrl, catalogLocale, enabled]);

  const setShippingMethod = useCallback(
    (shippingMethodId: string) =>
      mutate("/cart/shipping-method", { shippingMethodId }),
    [mutate],
  );

  const getPaymentMethods = useCallback(async (): Promise<
    PaymentMethodOption[] | null
  > => {
    if (!enabled || !anonymousId) {
      return [];
    }
    const params = new URLSearchParams();
    const headers: Record<string, string> = {};
    const token = sessionTokenRef.current;
    if (token) {
      headers[CART_SESSION_HEADER] = token;
    } else {
      params.set("anonymousId", anonymousId);
    }
    if (cartRef.current?.id) {
      params.set("cartId", cartRef.current.id);
    }
    if (catalogLocale) {
      params.set("catalogLocale", catalogLocale);
    }

    setIsMutating(true);
    setError(null);
    try {
      const response = await fetch(
        `${apiBaseUrl}/cart/payment-methods?${params.toString()}`,
        token ? { headers } : undefined,
      );
      const body = await parseCartApi(response);
      return body.paymentMethods ?? [];
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment methods request failed");
      return null;
    } finally {
      setIsMutating(false);
    }
  }, [anonymousId, apiBaseUrl, catalogLocale, enabled]);

  const authorizePayment = useCallback(
    async (method: string): Promise<PaymentSnapshot | null> => {
      if (!enabled || !anonymousId) {
        return null;
      }

      const run = async (): Promise<PaymentSnapshot | null> => {
        orderNumberRef.current ??= `cat-${createAnonymousId()}`;
        setIsMutating(true);
        setError(null);
        try {
          const response = await fetch(`${apiBaseUrl}/cart/payment`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              anonymousId,
              sessionToken: sessionTokenRef.current ?? undefined,
              cartId: cartRef.current?.id,
              catalogLocale,
              method,
              orderNumber: orderNumberRef.current,
            }),
          });
          const body = await parseCartApi(response);
          if (body.cart) {
            applyCart(body.cart);
          }
          if (!body.payment) {
            throw new CartRequestError("Payment response is missing", response.status);
          }
          return body.payment;
        } catch (err) {
          setError(err instanceof Error ? err.message : "Payment failed");
          return null;
        } finally {
          setIsMutating(false);
        }
      };

      const pending = mutationChainRef.current.then(run, run);
      mutationChainRef.current = pending.then(
        () => undefined,
        () => undefined,
      );
      return pending;
    },
    [anonymousId, apiBaseUrl, applyCart, catalogLocale, enabled],
  );

  const getOrder = useCallback(
    async (orderNumber: string): Promise<OrderSnapshot | null> => {
      if (!enabled || !anonymousId || !orderNumber.trim()) {
        return null;
      }
      const params = new URLSearchParams();
      const headers: Record<string, string> = {};
      const token = sessionTokenRef.current;
      if (token) {
        headers[CART_SESSION_HEADER] = token;
      }
      params.set("anonymousId", anonymousId);
      params.set("orderNumber", orderNumber.trim());
      if (catalogLocale) {
        params.set("catalogLocale", catalogLocale);
      }

      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`${apiBaseUrl}/orders?${params.toString()}`, {
          headers,
        });
        const body = await parseCartApi(response);
        return body.order ?? null;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Order request failed");
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [anonymousId, apiBaseUrl, catalogLocale, enabled],
  );

  const listOrders = useCallback(async (): Promise<OrderSnapshot[]> => {
    if (!enabled || !anonymousId) {
      return [];
    }
    const params = new URLSearchParams();
    const headers: Record<string, string> = {};
    const token = sessionTokenRef.current;
    if (token) {
      headers[CART_SESSION_HEADER] = token;
    }
    params.set("anonymousId", anonymousId);
    if (catalogLocale) {
      params.set("catalogLocale", catalogLocale);
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/orders?${params.toString()}`, {
        headers,
      });
      const body = await parseCartApi(response);
      return body.orders ?? [];
    } catch (err) {
      setError(err instanceof Error ? err.message : "Order request failed");
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [anonymousId, apiBaseUrl, catalogLocale, enabled]);

  const placeOrder = useCallback(async (): Promise<OrderSnapshot | null> => {
    if (!enabled || !anonymousId) {
      return null;
    }

    const run = async (): Promise<OrderSnapshot | null> => {
      if (!cartRef.current) {
        return null;
      }
      orderNumberRef.current ??= `cat-${createAnonymousId()}`;
      setIsMutating(true);
      setError(null);
      try {
        const response = await fetch(`${apiBaseUrl}/cart/order`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            anonymousId,
            sessionToken: sessionTokenRef.current ?? undefined,
            cartId: cartRef.current.id,
            catalogLocale,
            orderNumber: orderNumberRef.current,
          }),
        });
        const body = await parseCartApi(response);
        if (!body.order) {
          throw new CartRequestError("Order response is missing", response.status);
        }
        orderNumberRef.current = null;
        applyCart(null);
        return body.order;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Checkout failed");
        return null;
      } finally {
        setIsMutating(false);
      }
    };

    const pending = mutationChainRef.current.then(run, run);
    mutationChainRef.current = pending.then(
      () => undefined,
      () => undefined,
    );
    return pending;
  }, [anonymousId, apiBaseUrl, applyCart, catalogLocale, enabled]);

  const login = useCallback(
    async (input: { email: string; password: string }) => {
      if (!enabled) {
        return null;
      }

      setIsLoggingIn(true);
      setError(null);
      try {
        const response = await fetch(`${apiBaseUrl}/cart/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: input.email,
            password: input.password,
            anonymousId,
            catalogLocale,
            cartId: cartRef.current?.id,
          }),
        });
        const body = await parseCartApi(response);
        if (!body.sessionToken || !body.customer) {
          throw new CartRequestError("Sign in failed", response.status);
        }
        persistSession(body.sessionToken, body.customer);
        applyCart(body.cart ?? null);
        return body.cart ?? null;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Sign in failed");
        return null;
      } finally {
        setIsLoggingIn(false);
      }
    },
    [anonymousId, apiBaseUrl, applyCart, catalogLocale, enabled, persistSession],
  );

  const logout = useCallback(async () => {
    try {
      await fetch(`${apiBaseUrl}/cart/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
    } catch {
      // Client-side logout still proceeds if the network call fails.
    }
    clearSession();
    applyCart(null);
    setAnonymousId(rotateAnonymousId());
  }, [apiBaseUrl, applyCart, clearSession]);

  const openCart = useCallback(() => setIsCartOpen(true), []);
  const closeCart = useCallback(() => setIsCartOpen(false), []);
  const toggleCart = useCallback(() => setIsCartOpen((open) => !open), []);

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
