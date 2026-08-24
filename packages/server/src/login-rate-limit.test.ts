import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clientKeyFromWebHeaders,
  createLoginAttemptLimiter,
  TooManyRequestsError,
} from "./login-rate-limit.js";

describe("createLoginAttemptLimiter", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests under the limit and then rejects", () => {
    const limiter = createLoginAttemptLimiter({ windowMs: 60_000, limit: 2 });

    expect(() => limiter.consume("1.1.1.1")).not.toThrow();
    expect(() => limiter.consume("1.1.1.1")).not.toThrow();
    expect(() => limiter.consume("1.1.1.1")).toThrow(TooManyRequestsError);
  });

  it("resets the count after the window elapses", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-24T12:00:00Z"));
    const limiter = createLoginAttemptLimiter({ windowMs: 60_000, limit: 1 });

    limiter.consume("1.1.1.1");
    expect(() => limiter.consume("1.1.1.1")).toThrow(TooManyRequestsError);

    vi.setSystemTime(new Date("2026-08-24T12:01:00Z"));
    expect(() => limiter.consume("1.1.1.1")).not.toThrow();
  });

  it("tracks keys independently", () => {
    const limiter = createLoginAttemptLimiter({ windowMs: 60_000, limit: 1 });

    limiter.consume("1.1.1.1");
    expect(() => limiter.consume("2.2.2.2")).not.toThrow();
    expect(() => limiter.consume("1.1.1.1")).toThrow(TooManyRequestsError);
  });
});

describe("clientKeyFromWebHeaders", () => {
  it("uses the first x-forwarded-for hop", () => {
    const headers = new Headers({ "x-forwarded-for": " 203.0.113.10 , 10.0.0.1" });
    expect(clientKeyFromWebHeaders(headers)).toBe("203.0.113.10");
  });

  it("falls back to x-real-ip and then local", () => {
    expect(clientKeyFromWebHeaders(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe(
      "198.51.100.2",
    );
    expect(clientKeyFromWebHeaders(new Headers())).toBe("local");
  });
});
