import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import { CART_SESSION_HEADER } from "@commerce-ai-tool/core";

export { CART_SESSION_HEADER };

export function readCartSessionHeader(
  headers: Headers | IncomingHttpHeaders | undefined,
): string | undefined {
  if (!headers) {
    return undefined;
  }

  if (typeof (headers as Headers).get === "function") {
    const value = (headers as Headers).get(CART_SESSION_HEADER);
    const trimmed = value?.trim();
    return trimmed || undefined;
  }

  const raw = (headers as IncomingHttpHeaders)[CART_SESSION_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = value?.trim();
  return trimmed || undefined;
}

export const CART_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export interface CartSessionPayload {
  customerId: string;
  email: string;
  exp: number;
}

export class InvalidCartSessionError extends Error {
  constructor(message = "Invalid cart session") {
    super(message);
    this.name = "InvalidCartSessionError";
  }
}

export function signCartSession(
  payload: Omit<CartSessionPayload, "exp">,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  const body: CartSessionPayload = {
    customerId: payload.customerId,
    email: payload.email,
    exp: nowSeconds + CART_SESSION_TTL_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(body), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

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

  let payload: CartSessionPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as CartSessionPayload;
  } catch {
    throw new InvalidCartSessionError();
  }

  if (
    typeof payload.customerId !== "string" ||
    !payload.customerId ||
    typeof payload.email !== "string" ||
    typeof payload.exp !== "number"
  ) {
    throw new InvalidCartSessionError();
  }

  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new InvalidCartSessionError("Cart session expired");
  }

  return payload;
}
