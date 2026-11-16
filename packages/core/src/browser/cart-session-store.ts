import { createRandomUuid } from "../utils/random-uuid.js";
import type { CartSnapshot, CustomerSnapshot } from "../types/index.js";
import { safeStorage, type StorageLike } from "./storage.js";

export const ANONYMOUS_ID_STORAGE_KEY = "commerce-ai-tool:anonymousId";
export const CUSTOMER_SESSION_STORAGE_KEY = "commerce-ai-tool:customerSession";
export const CUSTOMER_STORAGE_KEY = "commerce-ai-tool:customer";

/** Ignore in-flight GET/refresh responses that lost a race to a newer mutation of the same cart. */
export function isStaleCartSnapshot(current: CartSnapshot | null, next: CartSnapshot | null): boolean {
  return Boolean(next && current && next.id === current.id && next.version < current.version);
}

export interface StoredCartSession {
  token: string;
  customer: CustomerSnapshot;
}

/** One participant of the cross-instance cart sync. */
export interface CartSyncMember {
  /** Tells every other member of the store about a cart change (`null` = cart cleared). */
  emit(cart: CartSnapshot | null): void;
  leave(): void;
}

export interface CartSessionStore {
  /** The guest id: stored value, else a new UUID that is persisted and kept in memory. */
  getAnonymousId(): string;
  /** Replaces the guest id, for example after logout or an expired customer session. */
  rotateAnonymousId(): string;
  /** The customer session, only when both the token and a well-formed customer are stored. */
  readSession(): StoredCartSession | null;
  saveSession(token: string, customer: CustomerSnapshot): void;
  clearSession(): void;
  isStaleCartSnapshot(current: CartSnapshot | null, next: CartSnapshot | null): boolean;
  /**
   * Runs cart mutations one at a time in call order, so each sees the cart version its
   * predecessor produced. A failed mutation rejects its own caller only; the queue goes on.
   */
  enqueueMutation<T>(run: () => Promise<T>): Promise<T>;
  /** Keeps several widget instances on a page (and host-owned cart UI) showing the same cart. */
  joinSync(onRemoteCart: (cart: CartSnapshot | null) => void): CartSyncMember;
}

function parseCustomer(raw: string | null): CustomerSnapshot | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<CustomerSnapshot> | null;
    if (parsed && typeof parsed.id === "string" && typeof parsed.email === "string") {
      return { id: parsed.id, email: parsed.email };
    }
  } catch {
    // Corrupt entry: treated as signed out.
  }
  return null;
}

/**
 * Cart identity and coordination shared by the React hook and the Angular service: storage keys,
 * guest id lifecycle, customer session persistence, the stale-snapshot guard, the mutation queue
 * and the cross-instance sync bus. State lives in the store, so widgets that must stay in sync
 * share one store (see {@link getSharedCartSessionStore}). Guest ids come from Web Crypto only.
 */
export function createCartSessionStore(storage: StorageLike): CartSessionStore {
  let memoryAnonymousId: string | null = null;
  let mutationChain: Promise<unknown> = Promise.resolve();
  const members = new Set<{ onRemoteCart: (cart: CartSnapshot | null) => void }>();

  const createAnonymousId = (): string => {
    memoryAnonymousId = createRandomUuid();
    storage.setItem(ANONYMOUS_ID_STORAGE_KEY, memoryAnonymousId);
    return memoryAnonymousId;
  };

  return {
    getAnonymousId() {
      const stored = storage.getItem(ANONYMOUS_ID_STORAGE_KEY);
      if (stored) {
        memoryAnonymousId = stored;
        return stored;
      }
      // Storage is empty or unavailable: keep the id this page already handed out.
      return memoryAnonymousId ?? createAnonymousId();
    },

    rotateAnonymousId: createAnonymousId,

    readSession() {
      const token = storage.getItem(CUSTOMER_SESSION_STORAGE_KEY);
      const customer = parseCustomer(storage.getItem(CUSTOMER_STORAGE_KEY));
      return token && customer ? { token, customer } : null;
    },

    saveSession(token, customer) {
      storage.setItem(CUSTOMER_SESSION_STORAGE_KEY, token);
      storage.setItem(CUSTOMER_STORAGE_KEY, JSON.stringify(customer));
    },

    clearSession() {
      storage.removeItem(CUSTOMER_SESSION_STORAGE_KEY);
      storage.removeItem(CUSTOMER_STORAGE_KEY);
    },

    isStaleCartSnapshot,

    enqueueMutation<T>(run: () => Promise<T>): Promise<T> {
      const pending = mutationChain.then(run);
      mutationChain = pending.then(
        () => undefined,
        () => undefined,
      );
      return pending;
    },

    joinSync(onRemoteCart) {
      const member = { onRemoteCart };
      members.add(member);
      return {
        emit(cart) {
          for (const other of members) {
            if (other !== member) {
              other.onRemoteCart(cart);
            }
          }
        },
        leave() {
          members.delete(member);
        },
      };
    },
  };
}

let sharedStore: CartSessionStore | undefined;

/** Storage that keeps nothing, so a server-side store never touches a process-wide `localStorage`. */
function createInMemoryStorage(): StorageLike {
  const entries = new Map<string, string>();
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
    removeItem: (key) => {
      entries.delete(key);
    },
  };
}

/**
 * The page-wide store over `localStorage`, created on first use in the browser. Widgets that
 * should share a cart (several instances, or a widget next to host checkout code) use this one so
 * they also share the mutation queue and sync bus.
 *
 * On the server (no `window`) it returns a new, unshared store on every call and caches nothing:
 * a module-level store would hand the same in-memory guest id (a bearer credential for guest
 * carts) to every SSR request in the process. That store also uses a private in-memory storage
 * instead of `globalThis.localStorage`: Node 25 with `--localstorage-file` and Deno expose a
 * process-wide `localStorage`, which would persist one guest id across requests. Render-time
 * server code must not rely on it for identity; cart state is read in the browser after hydration.
 */
export function getSharedCartSessionStore(): CartSessionStore {
  if (typeof window === "undefined") {
    return createCartSessionStore(createInMemoryStorage());
  }
  sharedStore ??= createCartSessionStore(safeStorage("local"));
  return sharedStore;
}
