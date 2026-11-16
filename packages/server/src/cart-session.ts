import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import { ANONYMOUS_ID_HEADER, CART_SESSION_HEADER } from "@commerce-ai-tool/core";

export { ANONYMOUS_ID_HEADER, CART_SESSION_HEADER };

type RequestHeaders = Headers | IncomingHttpHeaders | undefined;

function readHeader(headers: RequestHeaders, name: string): string | undefined {
  if (!headers) {
    return undefined;
  }

  if (typeof (headers as Headers).get === "function") {
    const value = (headers as Headers).get(name);
    const trimmed = value?.trim();
    return trimmed || undefined;
  }

  const raw = (headers as IncomingHttpHeaders)[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = value?.trim();
  return trimmed || undefined;
}

export function readCartSessionHeader(headers: RequestHeaders): string | undefined {
  return readHeader(headers, CART_SESSION_HEADER);
}

/**
 * Guest anonymousId for GET reads: the `x-commerce-ai-anonymous-id` header only. Callers
 * validate the value with the same rules as the JSON body (`resolveCartIdentity`).
 */
export function readAnonymousId(headers: RequestHeaders): string | undefined {
  return readHeader(headers, ANONYMOUS_ID_HEADER);
}

/** Lifetime of newly issued customer session tokens (24 h). */
export const CART_SESSION_TTL_SECONDS = 24 * 60 * 60;

/** Verified customer session. Tokens carry `{ customerId, iat, exp }`; `iat` is mandatory. */
export interface CartSessionPayload {
  customerId: string;
  /** Issued-at, in seconds since the epoch. */
  iat: number;
  exp: number;
}

export interface CartSessionVerifyOptions {
  secret: string;
  /** Host revocation check (`config.cartSession.isRevoked`). Called only for a validly signed, unexpired token. */
  isRevoked?: (payload: { customerId: string; iat: number }) => boolean | Promise<boolean>;
}

/** Tolerated clock skew between the instance that signed a token and the one that verifies it. */
const MAX_IAT_FUTURE_SKEW_SECONDS = 60;

export class InvalidCartSessionError extends Error {
  constructor(message = "Invalid cart session") {
    super(message);
    this.name = "InvalidCartSessionError";
  }
}

export function signCartSession(
  payload: { customerId: string },
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  const body: CartSessionPayload = {
    customerId: payload.customerId,
    iat: nowSeconds,
    exp: nowSeconds + CART_SESSION_TTL_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(body), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

/**
 * Checks the signature, shape and expiry of a session token. Does not consult the host
 * revocation hook: request paths use {@link authenticateCartSession} instead.
 */
export function verifyCartSession(token: string, secret: string): CartSessionPayload {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) {
    throw new InvalidCartSessionError();
  }

  const expected = createHmac("sha256", secret).update(encoded).digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    throw new InvalidCartSessionError();
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new InvalidCartSessionError();
  }

  if (!payload || typeof payload !== "object") {
    throw new InvalidCartSessionError();
  }

  const { customerId, iat, exp } = payload;
  const now = Math.floor(Date.now() / 1000);
  if (
    typeof customerId !== "string" ||
    !customerId ||
    typeof exp !== "number" ||
    !Number.isFinite(exp) ||
    // `iat` is mandatory: a token without one (issued before 2.6.0) is rejected. It must also be
    // a plausible issue time: not negative and not (beyond clock skew) in the future.
    typeof iat !== "number" ||
    !Number.isFinite(iat) ||
    iat < 0 ||
    iat > now + MAX_IAT_FUTURE_SKEW_SECONDS
  ) {
    throw new InvalidCartSessionError();
  }

  if (exp < now) {
    throw new InvalidCartSessionError("Cart session expired");
  }

  return { customerId, iat, exp };
}

/**
 * Verifies a session token and then asks the host whether it was revoked. Every request path
 * that trusts a session token must go through this function so revocation is never skipped.
 */
export async function authenticateCartSession(
  token: string,
  options: CartSessionVerifyOptions,
): Promise<CartSessionPayload> {
  const payload = verifyCartSession(token, options.secret);
  if (options.isRevoked && (await options.isRevoked({ customerId: payload.customerId, iat: payload.iat }))) {
    throw new InvalidCartSessionError("Cart session revoked");
  }
  return payload;
}
