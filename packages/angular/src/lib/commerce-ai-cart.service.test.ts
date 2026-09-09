import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CART_SESSION_HEADER } from "@commerce-ai-tool/core";
import {
  ANONYMOUS_ID_STORAGE_KEY,
  CUSTOMER_SESSION_STORAGE_KEY,
  CUSTOMER_STORAGE_KEY,
  CommerceAiCartService,
} from "./commerce-ai-cart.service.js";

const sampleCart = {
  id: "cart-1",
  version: 1,
  anonymousId: "anon-1",
  lineItems: [],
  totalPrice: { amount: 0, currency: "EUR", formatted: "€0.00" },
  totalQuantity: 0,
};

function createService(enabled = true): CommerceAiCartService {
  const service = new CommerceAiCartService();
  service.configure({ apiBaseUrl: "/api/commerce-ai", currency: "EUR", enabled });
  return service;
}

describe("CommerceAiCartService", () => {
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
    createService(false);
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("loads the cart on configure", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ cart: sampleCart }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const service = createService();
    await vi.waitFor(() => {
      expect(service.cart()).toEqual(sampleCart);
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/commerce-ai/cart?anonymousId=anon-1");
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

    const service = createService();
    await vi.waitFor(() => {
      expect(service.cart()).toEqual(sampleCart);
    });

    await service.addItems([
      { sku: "RACKET-1", quantity: 1 },
      { sku: "BALL-1", quantity: 2 },
    ]);

    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/commerce-ai/cart/add-items",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("RACKET-1"),
      }),
    );
    expect(service.cart()).toEqual(updated);
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

    const service = createService();
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const firstPromise = service.addToCart({ sku: "FIRST" });
    await Promise.resolve();
    const secondPromise = service.addToCart({ sku: "SECOND" });
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/cart/add"))).toHaveLength(1);
    releaseFirst?.({});
    const firstDone = await firstPromise;
    const secondDone = await secondPromise;

    expect(firstDone?.id).toBe("cart-created");
    expect(secondDone?.id).toBe("cart-created");
    const addBodies = fetchMock.mock.calls
      .filter(([url]) => String(url).includes("/cart/add"))
      .map(([, init]) => JSON.parse((init as { body: string }).body));
    expect(addBodies[1]?.cartId).toBe("cart-created");
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

    const service = createService();
    await vi.waitFor(() => {
      expect(window.localStorage.getItem(CUSTOMER_SESSION_STORAGE_KEY)).toBeNull();
    });

    expect(service.customer()).toBeNull();
    expect(service.isAuthenticated()).toBe(false);
    expect(service.anonymousId()).not.toBe("anon-1");
    expect(window.localStorage.getItem(ANONYMOUS_ID_STORAGE_KEY)).toBe(service.anonymousId());
  });
});
