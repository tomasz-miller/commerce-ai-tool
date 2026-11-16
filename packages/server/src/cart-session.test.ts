import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  CART_SESSION_HEADER,
  CART_SESSION_TTL_SECONDS,
  InvalidCartSessionError,
  authenticateCartSession,
  readCartSessionHeader,
  signCartSession,
  verifyCartSession,
} from "./cart-session.js";

/** Signs an arbitrary payload the way 2.x tokens were signed (used for legacy-token tests). */
function signRaw(payload: Record<string, unknown>, secret: string): string {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function decodePayload(token: string): Record<string, unknown> {
  const [encoded] = token.split(".");
  return JSON.parse(Buffer.from(encoded ?? "", "base64url").toString("utf8")) as Record<
    string,
    unknown
  >;
}

describe("cart-session", () => {
  const secret = "test-secret";

  it("round-trips a signed session", () => {
    const token = signCartSession({ customerId: "cust-1" }, secret);
    expect(verifyCartSession(token, secret)).toMatchObject({ customerId: "cust-1" });
  });

  it("issues tokens without email and with iat", () => {
    const now = 1_800_000_000;
    const token = signCartSession({ customerId: "cust-1" }, secret, now);
    expect(CART_SESSION_TTL_SECONDS).toBe(24 * 60 * 60);
    expect(decodePayload(token)).toEqual({
      customerId: "cust-1",
      iat: now,
      exp: now + 24 * 60 * 60,
    });
  });

  it("tokens without iat are rejected", () => {
    const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 6;
    const legacy = signRaw({ customerId: "cust-1", email: "shopper@example.test", exp }, secret);
    expect(() => verifyCartSession(legacy, secret)).toThrow(InvalidCartSessionError);
    expect(() =>
      verifyCartSession(signRaw({ customerId: "cust-1", exp }, secret), secret),
    ).toThrow(InvalidCartSessionError);
  });

  it("rejects an iat that is negative, non-finite or too far in the future", () => {
    const now = Math.floor(Date.now() / 1000);
    const exp = now + 3600;
    for (const iat of [-1, now + 3600, now + 61]) {
      expect(() => verifyCartSession(signRaw({ customerId: "c", iat, exp }, secret), secret)).toThrow(
        InvalidCartSessionError,
      );
    }
    // JSON cannot carry NaN or Infinity, so they arrive as null or a string.
    for (const iat of [null, "Infinity", Number.NaN]) {
      expect(() => verifyCartSession(signRaw({ customerId: "c", iat, exp }, secret), secret)).toThrow(
        InvalidCartSessionError,
      );
    }
  });

  it("accepts an iat within 60 seconds of clock skew", () => {
    const now = Math.floor(Date.now() / 1000);
    const token = signRaw({ customerId: "c", iat: now + 30, exp: now + 3600 }, secret);
    expect(verifyCartSession(token, secret)).toMatchObject({ customerId: "c", iat: now + 30 });
  });

  it("rejects a token whose iat is not a number", () => {
    const exp = Math.floor(Date.now() / 1000) + 60;
    const token = signRaw({ customerId: "cust-1", iat: "yesterday", exp }, secret);
    expect(() => verifyCartSession(token, secret)).toThrow(InvalidCartSessionError);
  });

  it("rejects a token for which isRevoked returns true", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = signCartSession({ customerId: "cust-1" }, secret, now);
    const isRevoked = vi.fn().mockResolvedValue(true);
    await expect(authenticateCartSession(token, { secret, isRevoked })).rejects.toBeInstanceOf(
      InvalidCartSessionError,
    );
    expect(isRevoked).toHaveBeenCalledWith({ customerId: "cust-1", iat: now });
  });

  it("accepts a token when isRevoked returns false (sync or async)", async () => {
    const token = signCartSession({ customerId: "cust-1" }, secret);
    await expect(
      authenticateCartSession(token, { secret, isRevoked: () => false }),
    ).resolves.toMatchObject({ customerId: "cust-1" });
    await expect(
      authenticateCartSession(token, { secret, isRevoked: async () => false }),
    ).resolves.toMatchObject({ customerId: "cust-1" });
    await expect(authenticateCartSession(token, { secret })).resolves.toMatchObject({
      customerId: "cust-1",
    });
  });

  it("does not call isRevoked for a token without iat", async () => {
    const exp = Math.floor(Date.now() / 1000) + 60;
    const legacy = signRaw({ customerId: "cust-1", exp }, secret);
    const isRevoked = vi.fn().mockReturnValue(false);
    await expect(authenticateCartSession(legacy, { secret, isRevoked })).rejects.toBeInstanceOf(
      InvalidCartSessionError,
    );
    expect(isRevoked).not.toHaveBeenCalled();
  });

  it("propagates an error thrown by isRevoked (the request fails, it is not treated as invalid)", async () => {
    const token = signCartSession({ customerId: "cust-1" }, secret);
    const boom = new Error("denylist down");
    const rejected = authenticateCartSession(token, {
      secret,
      isRevoked: () => {
        throw boom;
      },
    });
    await expect(rejected).rejects.toBe(boom);
    await expect(rejected).rejects.not.toBeInstanceOf(InvalidCartSessionError);
  });

  it("does not call isRevoked for a token with a bad signature", async () => {
    const token = signCartSession({ customerId: "cust-1" }, secret);
    const isRevoked = vi.fn().mockReturnValue(false);
    await expect(
      authenticateCartSession(token, { secret: "other-secret", isRevoked }),
    ).rejects.toBeInstanceOf(InvalidCartSessionError);
    expect(isRevoked).not.toHaveBeenCalled();
  });

  it("rejects a tampered token", () => {
    const token = signCartSession({ customerId: "cust-1" }, secret);
    expect(() => verifyCartSession(`${token}x`, secret)).toThrow(InvalidCartSessionError);
  });

  it("rejects a token signed with a different secret", () => {
    const token = signCartSession({ customerId: "cust-1" }, secret);
    expect(() => verifyCartSession(token, "other-secret")).toThrow(InvalidCartSessionError);
  });

  it("rejects an expired token", () => {
    const token = signCartSession(
      { customerId: "cust-1" },
      secret,
      Math.floor(Date.now() / 1000) - CART_SESSION_TTL_SECONDS - 60,
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
