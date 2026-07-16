import { createHash } from "node:crypto";

export function hashUint8Array(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
