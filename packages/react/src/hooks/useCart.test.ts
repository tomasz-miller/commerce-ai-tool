import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CartSnapshot } from "@commerce-ai-tool/core";
import { ANONYMOUS_ID_STORAGE_KEY, useCart } from "./useCart.js";

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
});
