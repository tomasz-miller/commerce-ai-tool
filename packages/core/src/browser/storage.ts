/** The subset of the Web Storage API the browser modules use. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Web Storage that never throws. Browsers raise `SecurityError` when storage is blocked (cookie
 * settings, sandboxed iframes) and `QuotaExceededError` when it is full; the property access
 * itself can throw too. Every access is guarded: reads return `null`, writes are dropped and the
 * caller keeps working from memory. Without any storage (SSR) it is inert.
 */
export function safeStorage(kind: "local" | "session"): StorageLike {
  const resolve = (): StorageLike | null => {
    try {
      const storage = kind === "local" ? globalThis.localStorage : globalThis.sessionStorage;
      return storage ?? null;
    } catch {
      return null;
    }
  };

  return {
    getItem(key) {
      try {
        return resolve()?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      try {
        resolve()?.setItem(key, value);
      } catch {
        // Blocked or full storage: the value only lives in memory.
      }
    },
    removeItem(key) {
      try {
        resolve()?.removeItem(key);
      } catch {
        // Blocked storage: nothing to remove.
      }
    },
  };
}
