import { describe, expect, it } from "vitest";
import { hashUint8Array } from "./hash.js";

describe("hashUint8Array", () => {
  it("returns a stable sha256 hex digest", () => {
    const first = hashUint8Array(new Uint8Array([1, 2, 3]));
    const second = hashUint8Array(new Uint8Array([1, 2, 3]));

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it("changes when the payload changes", () => {
    const first = hashUint8Array(new Uint8Array([1, 2, 3]));
    const second = hashUint8Array(new Uint8Array([1, 2, 4]));

    expect(first).not.toBe(second);
  });
});
