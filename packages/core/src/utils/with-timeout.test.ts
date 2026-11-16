import { describe, expect, it, vi } from "vitest";
import { SearchTimeoutError, withTimeout } from "./with-timeout.js";

describe("withTimeout", () => {
  it("resolves when the promise completes in time", async () => {
    await expect(withTimeout(() => Promise.resolve("ok"), 100, "fast")).resolves.toBe("ok");
  });

  it("rejects with SearchTimeoutError when timed out", async () => {
    await expect(
      withTimeout(() => new Promise(() => undefined), 20, "slow_step"),
    ).rejects.toBeInstanceOf(SearchTimeoutError);
  });

  it("aborts the inner signal on timeout", async () => {
    let inner: AbortSignal | undefined;
    const result = withTimeout(
      (signal) => {
        inner = signal;
        return new Promise(() => undefined);
      },
      20,
      "slow_step",
    );

    const error = await result.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SearchTimeoutError);
    expect((error as SearchTimeoutError).step).toBe("slow_step");
    expect(inner?.aborted).toBe(true);
    expect(inner?.reason).toBe(error);
  });

  it("aborts the inner signal and rejects with the parent's reason when the parent aborts", async () => {
    const parent = new AbortController();
    let inner: AbortSignal | undefined;
    const result = withTimeout(
      (signal) => {
        inner = signal;
        return new Promise(() => undefined);
      },
      10_000,
      "step",
      parent.signal,
    );
    const reason = new DOMException("client closed", "AbortError");

    parent.abort(reason);

    await expect(result).rejects.toBe(reason);
    expect(inner?.aborted).toBe(true);
  });

  it("does not start the step when the parent is already aborted", async () => {
    const parent = new AbortController();
    parent.abort();
    const fn = vi.fn(() => Promise.resolve("never"));

    await expect(withTimeout(fn, 100, "step", parent.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(fn).not.toHaveBeenCalled();
  });

  it("forwards a synchronous throw from the step", async () => {
    const boom = new Error("boom");
    await expect(
      withTimeout(() => {
        throw boom;
      }, 100, "step"),
    ).rejects.toBe(boom);
  });
});
