import { useCallback, useEffect, useRef, useState } from "react";
import type { CartSnapshot } from "@commerce-ai-tool/core";

export const ANONYMOUS_ID_STORAGE_KEY = "commerce-ai-tool:anonymousId";

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
  isLoading: boolean;
  isMutating: boolean;
  error: string | null;
  isCartOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  toggleCart: () => void;
  addToCart: (item: AddToCartItem) => Promise<CartSnapshot | null>;
  removeFromCart: (lineItemId: string) => Promise<CartSnapshot | null>;
  updateQuantity: (lineItemId: string, quantity: number) => Promise<CartSnapshot | null>;
  refresh: () => Promise<void>;
}

function readStoredAnonymousId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage.getItem(ANONYMOUS_ID_STORAGE_KEY);
  } catch {
    return null;
  }
}

function persistAnonymousId(id: string): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(ANONYMOUS_ID_STORAGE_KEY, id);
  } catch {
    // Ignore quota / privacy mode failures — session still works in memory.
  }
}

export function createAnonymousId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `anon-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getOrCreateAnonymousId(): string {
  const existing = readStoredAnonymousId();
  if (existing) {
    return existing;
  }
  const created = createAnonymousId();
  persistAnonymousId(created);
  return created;
}

async function parseCartResponse(response: Response): Promise<CartSnapshot | null> {
  const body = (await response.json()) as { cart?: CartSnapshot | null; error?: string };
  if (!response.ok) {
    throw new Error(body.error ?? "Cart request failed");
  }
  return body.cart ?? null;
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
  const [cart, setCart] = useState<CartSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const onCartChangeRef = useRef(onCartChange);
  onCartChangeRef.current = onCartChange;
  const cartRef = useRef<CartSnapshot | null>(null);
  const mutationChainRef = useRef(Promise.resolve<unknown>(undefined));

  const applyCart = useCallback((next: CartSnapshot | null) => {
    cartRef.current = next;
    setCart(next);
    onCartChangeRef.current?.(next);
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled || !anonymousId) {
      return;
    }

    const params = new URLSearchParams({ anonymousId });
    if (catalogLocale) {
      params.set("catalogLocale", catalogLocale);
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/cart?${params.toString()}`);
      applyCart(await parseCartResponse(response));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cart request failed");
    } finally {
      setIsLoading(false);
    }
  }, [anonymousId, apiBaseUrl, applyCart, catalogLocale, enabled]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    setAnonymousId(getOrCreateAnonymousId());
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
              currency,
              country,
              catalogLocale,
              cartId: cartRef.current?.id,
              cartVersion: cartRef.current?.version,
              ...body,
            }),
          });
          const next = await parseCartResponse(response);
          applyCart(next);
          return next;
        } catch (err) {
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
    [anonymousId, apiBaseUrl, applyCart, catalogLocale, country, currency, enabled],
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

  const openCart = useCallback(() => setIsCartOpen(true), []);
  const closeCart = useCallback(() => setIsCartOpen(false), []);
  const toggleCart = useCallback(() => setIsCartOpen((open) => !open), []);

  return {
    cart,
    anonymousId,
    isLoading,
    isMutating,
    error,
    isCartOpen,
    openCart,
    closeCart,
    toggleCart,
    addToCart,
    removeFromCart,
    updateQuantity,
    refresh,
  };
}
