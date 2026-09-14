import { describe, expect, it } from "vitest";
import {
  ANONYMOUS_ID_STORAGE_KEY,
  CUSTOMER_SESSION_STORAGE_KEY,
  CUSTOMER_STORAGE_KEY,
  CartSessionStore,
  createMemoryStorage,
} from "./cart-session.store.js";

function createStore(initial: Record<string, string> = {}): CartSessionStore {
  const store = new CartSessionStore();
  store.useBackend(createMemoryStorage(initial));
  return store;
}

describe("CartSessionStore", () => {
  it("uses the same storage keys as the widget cart service", () => {
    expect(ANONYMOUS_ID_STORAGE_KEY).toBe("commerce-ai-tool:anonymousId");
    expect(CUSTOMER_SESSION_STORAGE_KEY).toBe("commerce-ai-tool:customerSession");
    expect(CUSTOMER_STORAGE_KEY).toBe("commerce-ai-tool:customer");
  });

  it("creates and reuses the anonymous id", () => {
    const store = createStore();
    const first = store.getOrCreateAnonymousId();
    expect(first).not.toBe("");
    expect(store.getOrCreateAnonymousId()).toBe(first);
  });

  it("rotates the anonymous id", () => {
    const store = createStore({ [ANONYMOUS_ID_STORAGE_KEY]: "anon-1" });
    const rotated = store.rotateAnonymousId();
    expect(rotated).not.toBe("anon-1");
    expect(store.getOrCreateAnonymousId()).toBe(rotated);
  });

  it("writes, reads, and clears the customer session", () => {
    const store = createStore();
    expect(store.readSessionToken()).toBeNull();

    store.writeSession("sess-1", JSON.stringify({ id: "cust-1", email: "ada@example.com" }));
    expect(store.readSessionToken()).toBe("sess-1");
    expect(store.readCustomerJson()).toContain("ada@example.com");

    store.clearSession();
    expect(store.readSessionToken()).toBeNull();
    expect(store.readCustomerJson()).toBeNull();
  });
});
