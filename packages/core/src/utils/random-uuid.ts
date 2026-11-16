/**
 * RFC 4122 version 4 UUID from the Web Crypto API. Uses `crypto.randomUUID` where available
 * (secure contexts only) and otherwise `crypto.getRandomValues`, which also works over plain
 * HTTP. Never falls back to `Math.random`: the id is a bearer credential for guest carts.
 */
export function createRandomUuid(): string {
  const cryptoRef = (
    globalThis as {
      crypto?: {
        randomUUID?: () => string;
        getRandomValues?: (array: Uint8Array) => Uint8Array;
      };
    }
  ).crypto;
  if (typeof cryptoRef?.randomUUID === "function") {
    return cryptoRef.randomUUID();
  }
  if (typeof cryptoRef?.getRandomValues !== "function") {
    throw new Error("Web Crypto is not available to generate a random id");
  }

  const bytes = new Uint8Array(16);
  cryptoRef.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
