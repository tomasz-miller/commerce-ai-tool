import { Injectable } from "@angular/core";

/**
 * Storage keys shared with the widget cart service. The values must stay
 * identical to `CommerceAiCartService` so search and checkout share one session.
 */
export const ANONYMOUS_ID_STORAGE_KEY = "commerce-ai-tool:anonymousId";
export const CUSTOMER_SESSION_STORAGE_KEY = "commerce-ai-tool:customerSession";
export const CUSTOMER_STORAGE_KEY = "commerce-ai-tool:customer";

export interface SessionStorageBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function createMemoryStorage(initial: Record<string, string> = {}): SessionStorageBackend {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key) => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
  };
}

function browserStorage(): SessionStorageBackend | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

export function createAnonymousId(): string {
  const cryptoRef = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (typeof cryptoRef?.randomUUID === "function") {
    return cryptoRef.randomUUID();
  }
  return `anon-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

@Injectable({ providedIn: "root" })
export class CartSessionStore {
  private backend: SessionStorageBackend | null = null;

  /** Override the storage backend (used by unit tests). */
  useBackend(backend: SessionStorageBackend | null): void {
    this.backend = backend;
  }

  getOrCreateAnonymousId(): string {
    const storage = this.storage();
    const existing = storage?.getItem(ANONYMOUS_ID_STORAGE_KEY);
    if (existing) {
      return existing;
    }
    const created = createAnonymousId();
    storage?.setItem(ANONYMOUS_ID_STORAGE_KEY, created);
    return created;
  }

  rotateAnonymousId(): string {
    const created = createAnonymousId();
    this.storage()?.setItem(ANONYMOUS_ID_STORAGE_KEY, created);
    return created;
  }

  readSessionToken(): string | null {
    return this.storage()?.getItem(CUSTOMER_SESSION_STORAGE_KEY) ?? null;
  }

  writeSession(token: string, customerJson: string): void {
    this.storage()?.setItem(CUSTOMER_SESSION_STORAGE_KEY, token);
    this.storage()?.setItem(CUSTOMER_STORAGE_KEY, customerJson);
  }

  clearSession(): void {
    this.storage()?.removeItem(CUSTOMER_SESSION_STORAGE_KEY);
    this.storage()?.removeItem(CUSTOMER_STORAGE_KEY);
  }

  readCustomerJson(): string | null {
    return this.storage()?.getItem(CUSTOMER_STORAGE_KEY) ?? null;
  }

  private storage(): SessionStorageBackend | null {
    return this.backend ?? browserStorage();
  }
}
