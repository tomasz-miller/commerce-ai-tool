import { hashUint8Array } from "../utils/hash.js";

export interface RedactedBinaryInput {
  mimeType: string;
  byteLength: number;
  hash: string;
}

/** Safe observation input for audio/image payloads (no raw bytes or base64). */
export function redactBinaryInput(mimeType: string, bytes: Uint8Array): RedactedBinaryInput {
  return {
    mimeType,
    byteLength: bytes.byteLength,
    hash: hashUint8Array(bytes),
  };
}

/**
 * Redacts a base64 (or data URI) image. The hash covers the whole decoded payload, so it equals
 * `redactBinaryInput(mimeType, bytes).hash` of the same image and the two spans correlate.
 */
export function redactBase64ImageInput(mimeType: string, imageBase64: string): RedactedBinaryInput {
  const payload = imageBase64.includes(",")
    ? imageBase64.slice(imageBase64.indexOf(",") + 1)
    : imageBase64;
  return redactBinaryInput(mimeType, Buffer.from(payload, "base64"));
}
