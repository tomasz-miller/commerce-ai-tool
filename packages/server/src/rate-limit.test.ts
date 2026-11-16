import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createFixedWindowLimiter,
  defaultClientKey,
  hashLoginKey,
  ORDER_RATE_LIMIT_MAX_ATTEMPTS,
  ORDER_RATE_LIMIT_WINDOW_MS,
  TooManyRequestsError,
} from "./rate-limit.js";

describe("createFixedWindowLimiter", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests under the limit and then rejects", () => {
    const limiter = createFixedWindowLimiter({ windowMs: 60_000, limit: 2 });

    expect(() => limiter.consume("1.1.1.1")).not.toThrow();
    expect(() => limiter.consume("1.1.1.1")).not.toThrow();
    expect(() => limiter.consume("1.1.1.1")).toThrow(TooManyRequestsError);
  });

  it("uses the configured message and a positive Retry-After", () => {
    const limiter = createFixedWindowLimiter({ windowMs: 60_000, limit: 1, message: "Slow down." });
    limiter.consume("k");

    try {
      limiter.consume("k");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(TooManyRequestsError);
      expect((error as TooManyRequestsError).message).toBe("Slow down.");
      expect((error as TooManyRequestsError).retryAfterSeconds).toBe(60);
    }
  });

  it("resets the count after the window elapses", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-24T12:00:00Z"));
    const limiter = createFixedWindowLimiter({ windowMs: 60_000, limit: 1 });

    limiter.consume("1.1.1.1");
    expect(() => limiter.consume("1.1.1.1")).toThrow(TooManyRequestsError);

    vi.setSystemTime(new Date("2026-08-24T12:01:00Z"));
    expect(() => limiter.consume("1.1.1.1")).not.toThrow();
  });

  it("tracks keys independently", () => {
    const limiter = createFixedWindowLimiter({ windowMs: 60_000, limit: 1 });

    limiter.consume("1.1.1.1");
    expect(() => limiter.consume("2.2.2.2")).not.toThrow();
    expect(() => limiter.consume("1.1.1.1")).toThrow(TooManyRequestsError);
  });

  it("supports the order rate-limit defaults", () => {
    const limiter = createFixedWindowLimiter({
      windowMs: ORDER_RATE_LIMIT_WINDOW_MS,
      limit: ORDER_RATE_LIMIT_MAX_ATTEMPTS,
    });

    for (let i = 0; i < ORDER_RATE_LIMIT_MAX_ATTEMPTS; i += 1) {
      expect(() => limiter.consume("order-ip")).not.toThrow();
    }
    expect(() => limiter.consume("order-ip")).toThrow(TooManyRequestsError);
  });

  it("prunes expired keys", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-24T12:00:00Z"));
    const limiter = createFixedWindowLimiter({ windowMs: 60_000, limit: 5 });

    limiter.consume("a");
    limiter.consume("b");
    limiter.consume("c");
    expect(limiter.size()).toBe(3);

    vi.setSystemTime(new Date("2026-08-24T12:01:00Z"));
    limiter.consume("d");
    expect(limiter.size()).toBe(1);
  });

  it("when full, evicts the lowest-count active window, not a hot key", () => {
    const limiter = createFixedWindowLimiter({ windowMs: 60_000, limit: 5, maxKeys: 3 });

    limiter.consume("hot");
    limiter.consume("hot");
    limiter.consume("hot");
    limiter.consume("cold-1");
    limiter.consume("cold-2");
    limiter.consume("cold-2");

    limiter.consume("new");

    expect(limiter.size()).toBe(3);
    // "cold-1" (count 1) was evicted; "hot" (3) and "cold-2" (2) kept their counts.
    limiter.consume("hot");
    limiter.consume("hot");
    expect(() => limiter.consume("hot")).toThrow(TooManyRequestsError);
    limiter.consume("cold-2");
    limiter.consume("cold-2");
    limiter.consume("cold-2");
    expect(() => limiter.consume("cold-2")).toThrow(TooManyRequestsError);
  });

  it("breaks lowest-count ties by evicting the oldest window", () => {
    const limiter = createFixedWindowLimiter({ windowMs: 60_000, limit: 1, maxKeys: 2 });

    limiter.consume("first");
    limiter.consume("second");
    limiter.consume("third");

    // "first" was evicted (fresh window again); "second" is still exhausted.
    expect(() => limiter.consume("second")).toThrow(TooManyRequestsError);
    expect(limiter.size()).toBe(2);
  });

  it("a hot key keeps its count after the map is flooded with new keys", () => {
    const limiter = createFixedWindowLimiter({ windowMs: 60_000, limit: 10, maxKeys: 100 });

    for (let i = 0; i < 10; i += 1) {
      limiter.consume("attacker");
    }
    for (let i = 0; i < 1_000; i += 1) {
      limiter.consume(`spray-${i}`);
    }

    expect(limiter.size()).toBe(100);
    expect(() => limiter.consume("attacker")).toThrow(TooManyRequestsError);
  });

  it("a new key is always admitted", () => {
    const limiter = createFixedWindowLimiter({ windowMs: 60_000, limit: 1, maxKeys: 2 });

    limiter.consume("a");
    limiter.consume("b");

    expect(() => limiter.consume("c")).not.toThrow();
    expect(() => limiter.consume("d")).not.toThrow();
    expect(limiter.size()).toBe(2);
  });

  it("defaults maxKeys to 10_000", () => {
    const limiter = createFixedWindowLimiter({ windowMs: 60_000, limit: 1 });
    for (let i = 0; i < 10_001; i += 1) {
      limiter.consume(`k-${i}`);
    }
    expect(limiter.size()).toBe(10_000);
  });

  it("release gives back one slot, never goes below 0 and never creates a window", () => {
    const limiter = createFixedWindowLimiter({ windowMs: 60_000, limit: 2 });

    const first = limiter.consume("a");
    limiter.release("unknown", first);
    expect(limiter.size()).toBe(1);

    const second = limiter.consume("a");
    expect(() => limiter.consume("a")).toThrow(TooManyRequestsError);

    limiter.release("a", second);
    expect(() => limiter.consume("a")).not.toThrow();
    expect(() => limiter.consume("a")).toThrow(TooManyRequestsError);

    limiter.release("a", first);
    limiter.release("a", first);
    limiter.release("a", first);
    limiter.consume("a");
    limiter.consume("a");
    expect(() => limiter.consume("a")).toThrow(TooManyRequestsError);
  });

  it("release after the window rolled over does not decrement the new window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-24T12:00:00Z"));
    const limiter = createFixedWindowLimiter({ windowMs: 60_000, limit: 2 });

    const stale = limiter.consume("a");
    vi.setSystemTime(new Date("2026-08-24T12:01:00Z"));
    limiter.consume("a"); // second attempt opens the new window (count 1)

    limiter.release("a", stale);

    // New window still has count 1: one more is allowed, then it is exhausted.
    expect(() => limiter.consume("a")).not.toThrow();
    expect(() => limiter.consume("a")).toThrow(TooManyRequestsError);
  });

  it("release after the key was evicted is a no-op", () => {
    const limiter = createFixedWindowLimiter({ windowMs: 60_000, limit: 2, maxKeys: 1 });

    const evicted = limiter.consume("a");
    limiter.consume("b"); // evicts "a"
    limiter.consume("a"); // evicts "b"; "a" gets a new window (count 1)

    limiter.release("a", evicted);

    expect(() => limiter.consume("a")).not.toThrow();
    expect(() => limiter.consume("a")).toThrow(TooManyRequestsError);
  });
});

describe("defaultClientKey", () => {
  it("defaultClientKey uses the right-most X-Forwarded-For entry", () => {
    const headers = new Headers({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" });
    expect(defaultClientKey(headers)).toBe("2.2.2.2");
  });

  it("ignores empty X-Forwarded-For entries", () => {
    expect(defaultClientKey(new Headers({ "x-forwarded-for": "1.1.1.1, " }))).toBe("1.1.1.1");
  });

  it("falls back to x-real-ip and then local", () => {
    expect(defaultClientKey(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(defaultClientKey(new Headers())).toBe("local");
  });
});

describe("hashLoginKey", () => {
  it("hashes the trimmed lower-case email with SHA-256", () => {
    const expected = createHash("sha256").update("ada@example.com").digest("hex");
    expect(hashLoginKey("  Ada@Example.COM ")).toBe(expected);
    expect(hashLoginKey("ada@example.com")).toBe(expected);
  });
});
