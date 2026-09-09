import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CART_SESSION_HEADER, type CartSnapshot } from "@commerce-ai-tool/core";
import {
  ANONYMOUS_ID_STORAGE_KEY,
  CUSTOMER_SESSION_STORAGE_KEY,
  CUSTOMER_STORAGE_KEY,
  useCart,
} from "./useCart.js";

const sampleCart = {
  id: "cart-1",
  version: 1,
  anonymousId: "anon-1",
  lineItems: [],
  totalPrice: { amount: 0, currency: "EUR", formatted: "€0.00" },
  totalQuantity: 0,
};

describe("useCart", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem(ANONYMOUS_ID_STORAGE_KEY, "anon-1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("does not fetch when disabled", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderHook(() => useCart({ apiBaseUrl: "/api/commerce-ai", enabled: false }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("loads the cart on mount", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ cart: sampleCart }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useCart({ apiBaseUrl: "/api/commerce-ai" }));

    await waitFor(() => {
      expect(result.current.cart).toEqual(sampleCart);
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/commerce-ai/cart?anonymousId=anon-1");
  });

  it("adds a line item and notifies onCartChange", async () => {
    const onCartChange = vi.fn();
    const updated = { ...sampleCart, version: 2, totalQuantity: 1 };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ cart: sampleCart }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ cart: updated }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() =>
      useCart({ apiBaseUrl: "/api/commerce-ai", currency: "EUR", onCartChange }),
    );

    await waitFor(() => {
      expect(result.current.cart).toEqual(sampleCart);
    });

    await act(async () => {
      await result.current.addToCart({ sku: "SHOE-RED" });
    });

    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/commerce-ai/cart/add",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("SHOE-RED"),
      }),
    );
    expect(result.current.cart).toEqual(updated);
    expect(onCartChange).toHaveBeenCalledWith(updated);
  });

  it("adds multiple items through /cart/add-items", async () => {
    const updated = { ...sampleCart, version: 2, totalQuantity: 3 };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ cart: sampleCart }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ cart: updated }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useCart({ apiBaseUrl: "/api/commerce-ai", currency: "EUR" }));

    await waitFor(() => {
      expect(result.current.cart).toEqual(sampleCart);
    });

    await act(async () => {
      await result.current.addItems([
        { sku: "RACKET-1", quantity: 1 },
        { sku: "BALL-1", quantity: 2 },
      ]);
    });

    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/commerce-ai/cart/add-items",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("RACKET-1"),
      }),
    );
    expect(result.current.cart).toEqual(updated);
  });

  it("queues mutations so the second add sees the cart created by the first", async () => {
    let releaseFirst: ((value: unknown) => void) | undefined;
    const firstAdd = new Promise((resolve) => {
      releaseFirst = resolve;
    });
    const afterFirst = { ...sampleCart, id: "cart-created", version: 2 };
    const afterSecond = { ...sampleCart, id: "cart-created", version: 3, totalQuantity: 2 };

    const fetchMock = vi.fn((url: string, init?: { body?: string }) => {
      if (String(url).includes("/cart?")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ cart: null }),
        });
      }
      const sku = JSON.parse(init?.body ?? "{}").sku as string;
      if (sku === "FIRST") {
        return firstAdd.then(() => ({
          ok: true,
          json: async () => ({ cart: afterFirst }),
        }));
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ cart: afterSecond }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useCart({ apiBaseUrl: "/api/commerce-ai" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    let firstDone: CartSnapshot | null | undefined;
    let secondDone: CartSnapshot | null | undefined;

    await act(async () => {
      const firstPromise = result.current.addToCart({ sku: "FIRST" });
      await Promise.resolve();
      const secondPromise = result.current.addToCart({ sku: "SECOND" });
      expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/cart/add"))).toHaveLength(1);
      releaseFirst?.({});
      firstDone = await firstPromise;
      secondDone = await secondPromise;
    });

    expect(firstDone?.id).toBe("cart-created");
    expect(secondDone?.id).toBe("cart-created");
    const addBodies = fetchMock.mock.calls
      .filter(([url]) => String(url).includes("/cart/add"))
      .map(([, init]) => JSON.parse((init as { body: string }).body));
    expect(addBodies[1]?.cartId).toBe("cart-created");
  });

  it("toggles the cart panel", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ cart: null }),
      }),
    );

    const { result } = renderHook(() =>
      useCart({ apiBaseUrl: "/api/commerce-ai", enabled: false }),
    );

    act(() => {
      result.current.toggleCart();
    });
    expect(result.current.isCartOpen).toBe(true);

    act(() => {
      result.current.closeCart();
    });
    expect(result.current.isCartOpen).toBe(false);
  });

  it("persists the session token after login and sends it on later requests", async () => {
    const customer = { id: "cust-1", email: "ada@example.com" };
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (String(url).includes("/cart/login")) {
        return {
          ok: true,
          json: async () => ({
            cart: { ...sampleCart, customerId: "cust-1", anonymousId: undefined },
            customer,
            sessionToken: "sess-1",
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({ cart: sampleCart }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useCart({ apiBaseUrl: "/api/commerce-ai" }));

    await waitFor(() => {
      expect(result.current.cart).toEqual(sampleCart);
    });

    await act(async () => {
      await result.current.login({ email: "ada@example.com", password: "secret" });
    });

    expect(window.localStorage.getItem(CUSTOMER_SESSION_STORAGE_KEY)).toBe("sess-1");
    expect(result.current.customer).toEqual(customer);
    expect(result.current.isAuthenticated).toBe(true);

    await act(async () => {
      await result.current.addToCart({ sku: "SHOE-RED" });
    });

    const addCall = fetchMock.mock.calls.find(([url]) => String(url).includes("/cart/add"));
    expect(addCall).toBeDefined();
    const addBody = JSON.parse(String(addCall?.[1]?.body ?? "{}")) as { sessionToken?: string };
    expect(addBody.sessionToken).toBe("sess-1");
  });

  it("loads the cart with a stored session token", async () => {
    window.localStorage.setItem(CUSTOMER_SESSION_STORAGE_KEY, "sess-stored");
    window.localStorage.setItem(
      CUSTOMER_STORAGE_KEY,
      JSON.stringify({ id: "cust-1", email: "ada@example.com" }),
    );

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ cart: sampleCart }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useCart({ apiBaseUrl: "/api/commerce-ai" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).not.toContain("sessionToken=");
    expect(new Headers(init?.headers).get(CART_SESSION_HEADER)).toBe("sess-stored");
    expect(result.current.isAuthenticated).toBe(true);
  });

  it("clears the session and rotates anonymousId on 401", async () => {
    window.localStorage.setItem(CUSTOMER_SESSION_STORAGE_KEY, "sess-expired");
    window.localStorage.setItem(
      CUSTOMER_STORAGE_KEY,
      JSON.stringify({ id: "cust-1", email: "ada@example.com" }),
    );

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (new Headers(init?.headers).get(CART_SESSION_HEADER)) {
        return {
          ok: false,
          status: 401,
          json: async () => ({ error: "Invalid cart session" }),
        };
      }
      return {
        ok: true,
        json: async () => ({ cart: null }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useCart({ apiBaseUrl: "/api/commerce-ai" }));

    await waitFor(() => {
      expect(window.localStorage.getItem(CUSTOMER_SESSION_STORAGE_KEY)).toBeNull();
    });

    expect(result.current.customer).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.anonymousId).not.toBe("anon-1");
    expect(window.localStorage.getItem(ANONYMOUS_ID_STORAGE_KEY)).toBe(result.current.anonymousId);
  });

  it("clears the session and rotates anonymousId on logout", async () => {
    window.localStorage.setItem(CUSTOMER_SESSION_STORAGE_KEY, "sess-1");
    window.localStorage.setItem(
      CUSTOMER_STORAGE_KEY,
      JSON.stringify({ id: "cust-1", email: "ada@example.com" }),
    );

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ cart: null }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useCart({ apiBaseUrl: "/api/commerce-ai" }));

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true);
    });

    await act(async () => {
      await result.current.logout();
    });

    expect(window.localStorage.getItem(CUSTOMER_SESSION_STORAGE_KEY)).toBeNull();
    expect(result.current.customer).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.anonymousId).not.toBe("anon-1");
    expect(window.localStorage.getItem(ANONYMOUS_ID_STORAGE_KEY)).toBe(result.current.anonymousId);
  });

  it("calls checkout endpoints and clears the ordered cart", async () => {
    const order = {
      id: "order-1",
      orderNumber: "cat-1",
      orderState: "Open",
      totalPrice: sampleCart.totalPrice,
      lineItems: [],
    };
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/shipping-methods")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            shippingMethods: [{ id: "shipping-1", name: "Standard delivery" }],
          }),
        };
      }
      if (String(url).endsWith("/order")) {
        return { ok: true, status: 200, json: async () => ({ order }) };
      }
      return { ok: true, status: 200, json: async () => ({ cart: sampleCart }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useCart({ apiBaseUrl: "/api/commerce-ai" }));

    await waitFor(() => expect(result.current.cart).toEqual(sampleCart));
    await act(async () => {
      await result.current.setAddresses({
        firstName: "Ada",
        lastName: "Lovelace",
        streetName: "Main Street",
        postalCode: "10115",
        city: "Berlin",
        country: "DE",
      });
      await result.current.getShippingMethods();
      await result.current.setShippingMethod("shipping-1");
      await result.current.placeOrder();
    });

    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/cart/addresses"))).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/shipping-methods"))).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/shipping-method"))).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/cart/order"))).toBe(true);
    expect(result.current.cart).toBeNull();
  });

  it("returns null when shipping methods fail to load", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/shipping-methods")) {
        return {
          ok: false,
          status: 500,
          json: async () => ({ error: "Shipping methods request failed" }),
        };
      }
      return { ok: true, status: 200, json: async () => ({ cart: sampleCart }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useCart({ apiBaseUrl: "/api/commerce-ai" }));

    await waitFor(() => expect(result.current.cart).toEqual(sampleCart));
    let methods: Awaited<ReturnType<typeof result.current.getShippingMethods>> = [];
    await act(async () => {
      methods = await result.current.getShippingMethods();
    });

    expect(methods).toBeNull();
    expect(result.current.error).toBe("Shipping methods request failed");
  });

  it("serializes placeOrder behind other cart mutations", async () => {
    let resolveAddresses: (() => void) | undefined;
    const addressesGate = new Promise<void>((resolve) => {
      resolveAddresses = resolve;
    });
    const orderStarted = vi.fn();
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (String(url).includes("/addresses")) {
        await addressesGate;
        return { ok: true, status: 200, json: async () => ({ cart: sampleCart }) };
      }
      if (String(url).endsWith("/order")) {
        orderStarted();
        return {
          ok: true,
          status: 200,
          json: async () => ({
            order: {
              id: "order-1",
              orderNumber: "cat-1",
              orderState: "Open",
              totalPrice: sampleCart.totalPrice,
              lineItems: [],
            },
          }),
        };
      }
      return { ok: true, status: 200, json: async () => ({ cart: sampleCart }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useCart({ apiBaseUrl: "/api/commerce-ai" }));

    await waitFor(() => expect(result.current.cart).toEqual(sampleCart));

    let addressesPromise!: Promise<unknown>;
    let orderPromise!: Promise<unknown>;
    await act(async () => {
      addressesPromise = result.current.setAddresses({
        firstName: "Ada",
        lastName: "Lovelace",
        streetName: "Main Street",
        postalCode: "10115",
        city: "Berlin",
        country: "DE",
      });
      orderPromise = result.current.placeOrder();
    });

    expect(orderStarted).not.toHaveBeenCalled();
    resolveAddresses?.();
    await act(async () => {
      await addressesPromise;
      await orderPromise;
    });
    expect(orderStarted).toHaveBeenCalledTimes(1);
  });
});
