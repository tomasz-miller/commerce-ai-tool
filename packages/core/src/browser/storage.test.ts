import { afterEach, describe, expect, it, vi } from "vitest";
import { safeStorage, type StorageLike } from "./storage.js";

function stubStorageGlobals(local: unknown, session: unknown): void {
  vi.stubGlobal("localStorage", local);
  vi.stubGlobal("sessionStorage", session);
}

describe("safeStorage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("safeStorage survives a throwing getItem", () => {
    const throwing: StorageLike = {
      getItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
      setItem: () => {},
      removeItem: () => {},
    };
    stubStorageGlobals(throwing, throwing);

    expect(safeStorage("local").getItem("key")).toBeNull();
    expect(safeStorage("session").getItem("key")).toBeNull();
  });

  it("survives a throwing setItem and removeItem", () => {
    const throwing: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("quota", "QuotaExceededError");
      },
      removeItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
    };
    stubStorageGlobals(throwing, throwing);
    const storage = safeStorage("local");

    expect(() => storage.setItem("key", "value")).not.toThrow();
    expect(() => storage.removeItem("key")).not.toThrow();
  });

  it("survives a storage accessor that throws on property access", () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("blocked", "SecurityError");
      },
    });
    try {
      const storage = safeStorage("local");
      expect(storage.getItem("key")).toBeNull();
      expect(() => storage.setItem("key", "value")).not.toThrow();
      expect(() => storage.removeItem("key")).not.toThrow();
    } finally {
      Reflect.deleteProperty(globalThis, "localStorage");
    }
  });

  it("is inert when no Web Storage exists (SSR)", () => {
    stubStorageGlobals(undefined, undefined);
    const storage = safeStorage("session");

    expect(storage.getItem("key")).toBeNull();
    expect(() => storage.setItem("key", "value")).not.toThrow();
  });

  it("reads and writes through the selected storage kind", () => {
    const values = new Map<string, string>();
    const local: StorageLike = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => void values.set(key, value),
      removeItem: (key) => void values.delete(key),
    };
    stubStorageGlobals(local, undefined);
    const storage = safeStorage("local");

    storage.setItem("key", "value");
    expect(storage.getItem("key")).toBe("value");
    storage.removeItem("key");
    expect(storage.getItem("key")).toBeNull();
  });
});
