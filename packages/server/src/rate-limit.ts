import { createHash } from "node:crypto";
import { InvalidCredentialsError } from "@commerce-ai-tool/core";

export const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 10;
export const LOGIN_RATE_LIMIT_MESSAGE = "Too many login attempts. Try again later.";

export const ORDER_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const ORDER_RATE_LIMIT_MAX_ATTEMPTS = 20;
export const ORDER_RATE_LIMIT_MESSAGE = "Too many order attempts. Try again later.";

export const PAYMENT_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const PAYMENT_RATE_LIMIT_MAX_ATTEMPTS = 20;
export const PAYMENT_RATE_LIMIT_MESSAGE = "Too many payment attempts. Try again later.";

/** Shared bucket for `/search`, `/search/voice`, `/search/image` and `/tts`. */
export const AI_RATE_LIMIT_WINDOW_MS = 60 * 1000;
export const AI_RATE_LIMIT_MAX_REQUESTS = 30;
/** Separate bucket for `/search/suggestions` (one request per debounced keystroke). */
export const SUGGESTIONS_RATE_LIMIT_MAX_REQUESTS = 120;
export const AI_RATE_LIMIT_MESSAGE = "Too many requests. Try again later.";

export const DEFAULT_RATE_LIMIT_MAX_KEYS = 10_000;

/** `false` disables the limiter (only when an upstream gateway already throttles the route). */
export type RateLimitOption = false | { windowMs?: number; limit?: number };

export class TooManyRequestsError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number, message = LOGIN_RATE_LIMIT_MESSAGE) {
    super(message);
    this.name = "TooManyRequestsError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

declare const reservationBrand: unique symbol;

/** Opaque handle for the window a `consume` call counted against. */
export interface LimiterReservation {
  readonly [reservationBrand]: true;
}

export interface FixedWindowLimiter {
  /**
   * Counts one request for `key`; throws `TooManyRequestsError` once the window's limit is used up.
   * Returns a reservation for `release`; callers that never release can ignore it.
   */
  consume(key: string): LimiterReservation;
  /**
   * Gives back the slot taken by the `consume` call that returned `reservation`. A no-op when the
   * key's window has since rolled over or been evicted. Never goes below 0, never creates a window.
   */
  release(key: string, reservation: LimiterReservation): void;
  /** Number of tracked keys. Test hook. */
  size(): number;
}

export interface FixedWindowLimiterOptions {
  windowMs: number;
  limit: number;
  /**
   * Upper bound on tracked keys. When full (after pruning expired windows), a new key evicts
   * the active window with the lowest count (oldest first on ties). Hot keys are never the ones
   * evicted, and a new key is always admitted.
   */
  maxKeys?: number;
  /** Message carried by the thrown `TooManyRequestsError`. */
  message?: string;
}

/**
 * In-memory fixed-window limiter. State is per process (per serverless instance):
 * multi-instance hosts should add an edge or WAF limit as well.
 */
export function createFixedWindowLimiter(options: FixedWindowLimiterOptions): FixedWindowLimiter {
  const { windowMs, limit, maxKeys = DEFAULT_RATE_LIMIT_MAX_KEYS, message } = options;
  // Every window has the same length and a key is (re)inserted when its window starts,
  // so Map insertion order is also expiry order: the first entry always expires first.
  const windows = new Map<string, { count: number; resetAt: number }>();

  function pruneExpired(now: number): void {
    for (const [key, entry] of windows) {
      if (entry.resetAt > now) {
        return;
      }
      windows.delete(key);
    }
  }

  /**
   * Frees one slot when the map is full. Evicting the lowest-count window gives back at most
   * that key's small count, so flooding the map cannot reset a hot key or lock anyone out.
   * O(n), and only on the full path.
   */
  function evictColdest(): void {
    let coldestKey: string | undefined;
    let coldestCount = Number.POSITIVE_INFINITY;
    for (const [key, entry] of windows) {
      // Strict `<` keeps the earliest-inserted (oldest) key on ties.
      if (entry.count < coldestCount) {
        coldestKey = key;
        coldestCount = entry.count;
      }
    }
    if (coldestKey !== undefined) {
      windows.delete(coldestKey);
    }
  }

  return {
    consume(key: string) {
      const now = Date.now();
      pruneExpired(now);

      const current = windows.get(key);
      if (current) {
        if (current.count >= limit) {
          throw new TooManyRequestsError(
            Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
            message,
          );
        }
        current.count += 1;
        return current as unknown as LimiterReservation;
      }

      if (windows.size >= maxKeys) {
        evictColdest();
      }
      const created = { count: 1, resetAt: now + windowMs };
      windows.set(key, created);
      return created as unknown as LimiterReservation;
    },
    release(key: string, reservation: LimiterReservation) {
      // A rolled-over or evicted window is a new object, so a stale reservation never matches.
      const current = windows.get(key);
      if (current && current === (reservation as unknown) && current.count > 0) {
        current.count -= 1;
      }
    },
    size: () => windows.size,
  };
}

/**
 * Default client key for the Web `Request` adapter: the right-most `X-Forwarded-For` entry
 * (the address the closest proxy saw), then `x-real-ip`, then `"local"`.
 * Only safe behind a proxy that sets or appends `X-Forwarded-For`; otherwise pass `clientKey`.
 */
export function defaultClientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const entries = forwarded
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    const last = entries.at(-1);
    if (last) {
      return last;
    }
  }

  const realIp = headers.get("x-real-ip")?.trim();
  return realIp || "local";
}

/** Limiter key for per-account login throttling. The email itself is never stored. */
export function hashLoginKey(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

/**
 * Runs a login attempt under a per-email limiter that counts failed logins only.
 * A slot is reserved before the attempt and released again unless the login failed with
 * `InvalidCredentialsError`. An email whose bucket is exhausted is rejected before the attempt,
 * even with the correct password (soft lockout until the window ends).
 */
export async function limitFailedLogins<T>(
  limiter: Pick<FixedWindowLimiter, "consume" | "release"> | undefined,
  email: unknown,
  attempt: () => Promise<T>,
): Promise<T> {
  const key = limiter && typeof email === "string" && email.trim() ? hashLoginKey(email) : undefined;
  if (!limiter || !key) {
    return attempt();
  }

  // Reserve a slot before the attempt so parallel failures cannot overshoot the limit.
  const reservation = limiter.consume(key);
  let keepSlot = false;
  try {
    return await attempt();
  } catch (error) {
    keepSlot = error instanceof InvalidCredentialsError;
    throw error;
  } finally {
    if (!keepSlot) {
      limiter.release(key, reservation);
    }
  }
}

export function retryAfterHeaders(error: unknown): Record<string, string> | undefined {
  return error instanceof TooManyRequestsError
    ? { "Retry-After": String(error.retryAfterSeconds) }
    : undefined;
}
