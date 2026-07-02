import { describe, expect, it } from "vitest";
import { SearchTimeoutError, withTimeout } from "./with-timeout.js";

describe("withTimeout", () => {
  it("resolves when the promise completes in time", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 100, "fast")).resolves.toBe("ok");
  });

  it("rejects with SearchTimeoutError when timed out", async () => {
    await expect(
      withTimeout(new Promise(() => undefined), 20, "slow_step"),
    ).rejects.toBeInstanceOf(SearchTimeoutError);
  });
});
