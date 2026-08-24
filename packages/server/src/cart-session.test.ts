import { describe, expect, it } from "vitest";
import {
  CART_SESSION_HEADER,
  InvalidCartSessionError,
  readCartSessionHeader,
  signCartSession,
  verifyCartSession,
} from "./cart-session.js";

describe("cart-session", () => {
  const secret = "test-secret";

  it("round-trips a signed session", () => {
    const token = signCartSession({ customerId: "cust-1", email: "ada@example.com" }, secret);
    expect(verifyCartSession(token, secret)).toMatchObject({
      customerId: "cust-1",
      email: "ada@example.com",
    });
  });

  it("rejects a tampered token", () => {
    const token = signCartSession({ customerId: "cust-1", email: "ada@example.com" }, secret);
    expect(() => verifyCartSession(`${token}x`, secret)).toThrow(InvalidCartSessionError);
  });

  it("rejects a token signed with a different secret", () => {
    const token = signCartSession({ customerId: "cust-1", email: "ada@example.com" }, secret);
    expect(() => verifyCartSession(token, "other-secret")).toThrow(InvalidCartSessionError);
  });

  it("rejects an expired token", () => {
    const token = signCartSession(
      { customerId: "cust-1", email: "ada@example.com" },
      secret,
      Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 8,
    );
    expect(() => verifyCartSession(token, secret)).toThrow(InvalidCartSessionError);
  });

  it("reads the session token from web and node headers", () => {
    const token = "sess-from-header";
    const webHeaders = new Headers({ [CART_SESSION_HEADER]: ` ${token} ` });
    expect(readCartSessionHeader(webHeaders)).toBe(token);
    expect(readCartSessionHeader({ [CART_SESSION_HEADER]: token })).toBe(token);
    expect(readCartSessionHeader({ [CART_SESSION_HEADER]: [` ${token} `] })).toBe(token);
    expect(readCartSessionHeader(undefined)).toBeUndefined();
  });
});
