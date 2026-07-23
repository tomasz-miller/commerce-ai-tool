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

export function redactBase64ImageInput(mimeType: string, imageBase64: string): RedactedBinaryInput {
  const payload = imageBase64.includes(",")
    ? imageBase64.slice(imageBase64.indexOf(",") + 1)
    : imageBase64;
  const byteLength = Math.floor((payload.length * 3) / 4);
  return {
    mimeType,
    byteLength,
    hash: hashUint8Array(new TextEncoder().encode(payload.slice(0, 64))),
  };
}
