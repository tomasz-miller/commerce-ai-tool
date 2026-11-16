import { afterEach, describe, expect, it, vi } from "vitest";
import { createRandomUuid } from "./random-uuid.js";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("createRandomUuid", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses crypto.randomUUID when available", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "11111111-2222-4333-8444-555555555555" });
    expect(createRandomUuid()).toBe("11111111-2222-4333-8444-555555555555");
  });

  it("falls back to crypto.getRandomValues outside secure contexts", () => {
    const getRandomValues = vi.fn((array: Uint8Array) => array.fill(0xff));
    const mathRandom = vi.spyOn(Math, "random");
    vi.stubGlobal("crypto", { getRandomValues });

    const id = createRandomUuid();

    expect(id).toMatch(UUID_V4);
    expect(id).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
    expect(getRandomValues).toHaveBeenCalledTimes(1);
    expect(mathRandom).not.toHaveBeenCalled();
  });

  it("throws instead of using Math.random when Web Crypto is missing", () => {
    vi.stubGlobal("crypto", undefined);
    expect(() => createRandomUuid()).toThrow("Web Crypto");
  });
});
