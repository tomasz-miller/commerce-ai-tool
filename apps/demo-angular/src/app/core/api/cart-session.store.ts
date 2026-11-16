import { Injectable } from "@angular/core";
import {
  ANONYMOUS_ID_STORAGE_KEY,
  CUSTOMER_SESSION_STORAGE_KEY,
  CUSTOMER_STORAGE_KEY,
  createCartSessionStore,
  createRandomUuid,
  getSharedCartSessionStore,
  type CartSessionStore as CoreCartSessionStore,
  type CustomerSnapshot,
  type StorageLike,
} from "@commerce-ai-tool/core/client";

export { ANONYMOUS_ID_STORAGE_KEY, CUSTOMER_SESSION_STORAGE_KEY, CUSTOMER_STORAGE_KEY };

/** In-memory storage for unit tests. */
export function createMemoryStorage(initial: Record<string, string> = {}): StorageLike {
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

/** UUID v4 from Web Crypto (`randomUUID`, else `getRandomValues` outside secure contexts). */
export function createAnonymousId(): string {
  return createRandomUuid();
}

/**
 * Host access to the cart session the widget uses. It delegates to the page-wide store of
 * `@commerce-ai-tool/core/client`, so the storage keys, the guest id and the customer session are
 * the widget's own and cannot drift apart.
 */
@Injectable({ providedIn: "root" })
export class CartSessionStore {
  private override: CoreCartSessionStore | null = null;

  /** Override the storage backend (used by unit tests). */
  useBackend(backend: StorageLike | null): void {
    this.override = backend ? createCartSessionStore(backend) : null;
  }

  getOrCreateAnonymousId(): string {
    return this.core().getAnonymousId();
  }

  rotateAnonymousId(): string {
    return this.core().rotateAnonymousId();
  }

  readSessionToken(): string | null {
    return this.core().readSession()?.token ?? null;
  }

  readCustomer(): CustomerSnapshot | null {
    return this.core().readSession()?.customer ?? null;
  }

  writeSession(token: string, customer: CustomerSnapshot): void {
    this.core().saveSession(token, customer);
  }

  clearSession(): void {
    this.core().clearSession();
  }

  private core(): CoreCartSessionStore {
    return this.override ?? getSharedCartSessionStore();
  }
}
