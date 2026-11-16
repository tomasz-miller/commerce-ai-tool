import { afterEach, describe, expect, it, vi } from "vitest";
import type { CartSnapshot } from "../types/index.js";
import {
  ANONYMOUS_ID_STORAGE_KEY,
  CUSTOMER_SESSION_STORAGE_KEY,
  CUSTOMER_STORAGE_KEY,
  createCartSessionStore,
  getSharedCartSessionStore,
  isStaleCartSnapshot,
} from "./cart-session-store.js";
import type { StorageLike } from "./storage.js";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { values: Map<string, string> } {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
}

const inertStorage: StorageLike = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

function cart(id: string, version: number): CartSnapshot {
  return { id, version, lineItems: [] } as unknown as CartSnapshot;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("storage keys", () => {
  it("keeps the keys the widgets and host checkout already share", () => {
    expect(ANONYMOUS_ID_STORAGE_KEY).toBe("commerce-ai-tool:anonymousId");
    expect(CUSTOMER_SESSION_STORAGE_KEY).toBe("commerce-ai-tool:customerSession");
    expect(CUSTOMER_STORAGE_KEY).toBe("commerce-ai-tool:customer");
  });
});

describe("anonymous id", () => {
  it("creates a UUID once, persists it and returns the same id afterwards", () => {
    const storage = memoryStorage();
    const store = createCartSessionStore(storage);

    const first = store.getAnonymousId();

    expect(first).toMatch(UUID_V4);
    expect(storage.values.get(ANONYMOUS_ID_STORAGE_KEY)).toBe(first);
    expect(store.getAnonymousId()).toBe(first);
  });

  it("reuses an id stored by an earlier page load or another store", () => {
    const store = createCartSessionStore(memoryStorage({ [ANONYMOUS_ID_STORAGE_KEY]: "guest-existing" }));

    expect(store.getAnonymousId()).toBe("guest-existing");
  });

  it("keeps one id for the page when storage cannot persist it", () => {
    const store = createCartSessionStore(inertStorage);

    expect(store.getAnonymousId()).toBe(store.getAnonymousId());
  });

  it("rotates to a new persisted id", () => {
    const storage = memoryStorage();
    const store = createCartSessionStore(storage);
    const before = store.getAnonymousId();

    const after = store.rotateAnonymousId();

    expect(after).not.toBe(before);
    expect(storage.values.get(ANONYMOUS_ID_STORAGE_KEY)).toBe(after);
    expect(store.getAnonymousId()).toBe(after);
  });

  it("falls back to crypto.getRandomValues without randomUUID and never uses Math.random", () => {
    const getRandomValues = vi.fn((array: Uint8Array) => array.fill(0xab));
    vi.stubGlobal("crypto", { getRandomValues });
    const mathRandom = vi.spyOn(Math, "random");
    const store = createCartSessionStore(memoryStorage());

    expect(store.getAnonymousId()).toMatch(UUID_V4);
    expect(store.rotateAnonymousId()).toMatch(UUID_V4);
    expect(getRandomValues).toHaveBeenCalledTimes(2);
    expect(mathRandom).not.toHaveBeenCalled();
  });
});

describe("customer session", () => {
  const customer = { id: "c1", email: "shopper@example.test" };

  it("round-trips a saved session", () => {
    const storage = memoryStorage();
    const store = createCartSessionStore(storage);

    store.saveSession("token-abc", customer);

    expect(storage.values.get(CUSTOMER_SESSION_STORAGE_KEY)).toBe("token-abc");
    expect(createCartSessionStore(storage).readSession()).toEqual({ token: "token-abc", customer });
  });

  it("needs both the token and a well-formed customer", () => {
    expect(createCartSessionStore(memoryStorage()).readSession()).toBeNull();
    expect(
      createCartSessionStore(memoryStorage({ [CUSTOMER_SESSION_STORAGE_KEY]: "t" })).readSession(),
    ).toBeNull();
    expect(
      createCartSessionStore(
        memoryStorage({ [CUSTOMER_SESSION_STORAGE_KEY]: "t", [CUSTOMER_STORAGE_KEY]: "{not json" }),
      ).readSession(),
    ).toBeNull();
    expect(
      createCartSessionStore(
        memoryStorage({
          [CUSTOMER_SESSION_STORAGE_KEY]: "t",
          [CUSTOMER_STORAGE_KEY]: JSON.stringify({ id: 1 }),
        }),
      ).readSession(),
    ).toBeNull();
  });

  it("clears both entries", () => {
    const storage = memoryStorage();
    const store = createCartSessionStore(storage);
    store.saveSession("token-abc", customer);

    store.clearSession();

    expect(store.readSession()).toBeNull();
    expect(storage.values.size).toBe(0);
  });
});

describe("isStaleCartSnapshot", () => {
  it("flags an older version of the same cart only", () => {
    expect(isStaleCartSnapshot(cart("a", 5), cart("a", 4))).toBe(true);
    expect(isStaleCartSnapshot(cart("a", 5), cart("a", 5))).toBe(false);
    expect(isStaleCartSnapshot(cart("a", 5), cart("a", 6))).toBe(false);
    expect(isStaleCartSnapshot(cart("a", 5), cart("b", 1))).toBe(false);
    expect(isStaleCartSnapshot(null, cart("a", 1))).toBe(false);
    expect(isStaleCartSnapshot(cart("a", 5), null)).toBe(false);
  });

  it("is available on the store", () => {
    const store = createCartSessionStore(inertStorage);
    expect(store.isStaleCartSnapshot(cart("a", 2), cart("a", 1))).toBe(true);
  });
});

describe("mutation queue", () => {
  it("runs mutations one at a time in call order", async () => {
    const store = createCartSessionStore(inertStorage);
    const events: string[] = [];
    const gate = { release: () => {} };
    const first = store.enqueueMutation(async () => {
      events.push("first:start");
      await new Promise<void>((resolve) => {
        gate.release = resolve;
      });
      events.push("first:end");
      return 1;
    });
    const second = store.enqueueMutation(async () => {
      events.push("second:start");
      return 2;
    });

    await Promise.resolve();
    expect(events).toEqual(["first:start"]);
    gate.release();

    await expect(Promise.all([first, second])).resolves.toEqual([1, 2]);
    expect(events).toEqual(["first:start", "first:end", "second:start"]);
  });

  it("keeps running after a mutation fails and still rejects that caller", async () => {
    const store = createCartSessionStore(inertStorage);

    const failed = store.enqueueMutation(async () => {
      throw new Error("boom");
    });
    const next = store.enqueueMutation(async () => "ok");

    await expect(failed).rejects.toThrow("boom");
    await expect(next).resolves.toBe("ok");
  });
});

describe("cross-instance sync", () => {
  it("delivers a cart to the other members, not to the sender", () => {
    const store = createCartSessionStore(inertStorage);
    const a = vi.fn();
    const b = vi.fn();
    const memberA = store.joinSync(a);
    store.joinSync(b);

    memberA.emit(cart("c1", 2));

    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledWith(cart("c1", 2));
  });

  it("passes null (cart cleared) along and stops after leave", () => {
    const store = createCartSessionStore(inertStorage);
    const a = vi.fn();
    const b = vi.fn();
    const memberA = store.joinSync(a);
    const memberB = store.joinSync(b);

    memberA.emit(null);
    expect(b).toHaveBeenCalledWith(null);

    memberB.leave();
    memberA.emit(cart("c1", 3));
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("is scoped to the store instance", () => {
    const one = createCartSessionStore(inertStorage);
    const two = createCartSessionStore(inertStorage);
    const listener = vi.fn();
    two.joinSync(listener);

    one.joinSync(vi.fn()).emit(cart("c1", 1));

    expect(listener).not.toHaveBeenCalled();
  });
});

describe("getSharedCartSessionStore", () => {
  it("returns one page-wide store in the browser", () => {
    vi.stubGlobal("window", {});

    expect(getSharedCartSessionStore()).toBe(getSharedCartSessionStore());
  });

  it("returns an unshared store per call on the server, so no guest id leaks across requests", () => {
    vi.stubGlobal("window", undefined);
    vi.stubGlobal("localStorage", undefined);

    const first = getSharedCartSessionStore();
    const second = getSharedCartSessionStore();

    expect(first).not.toBe(second);
    expect(first.getAnonymousId()).not.toBe(second.getAnonymousId());
  });

  it("never reads or writes a global localStorage on the server", () => {
    const setItem = vi.fn();
    const getItem = vi.fn(() => "leaked-guest-id");
    const removeItem = vi.fn();
    vi.stubGlobal("window", undefined);
    vi.stubGlobal("localStorage", { getItem, setItem, removeItem });

    const store = getSharedCartSessionStore();
    const id = store.getAnonymousId();
    store.rotateAnonymousId();
    store.saveSession("token", { id: "c1", email: "a@example.com" });
    store.clearSession();

    expect(id).not.toBe("leaked-guest-id");
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
  });
});
