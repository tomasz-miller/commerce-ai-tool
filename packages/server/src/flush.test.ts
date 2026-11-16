import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  flushLangfuse,
  LANGFUSE_FLUSH_GLOBAL_KEY,
  registerLangfuseFlush,
  scheduleFlush,
  type FlushDefer,
} from "./flush.js";

describe("@commerce-ai-tool/server/flush entry", () => {
  afterEach(() => {
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    registerLangfuseFlush(null);
  });

  it("exports the flush helpers and the global key", () => {
    expect(typeof flushLangfuse).toBe("function");
    expect(typeof registerLangfuseFlush).toBe("function");
    expect(LANGFUSE_FLUSH_GLOBAL_KEY).toBe("__commerceAiToolLangfuseFlush__");
  });

  it("exports scheduleFlush and the FlushDefer type for custom adapters", async () => {
    expectTypeOf(scheduleFlush).parameter(0).toEqualTypeOf<FlushDefer | undefined>();
    expectTypeOf<FlushDefer>().toEqualTypeOf<(fn: () => Promise<void>) => void>();

    process.env.LANGFUSE_PUBLIC_KEY = "pk";
    process.env.LANGFUSE_SECRET_KEY = "sk";
    const flush = vi.fn().mockResolvedValue(undefined);
    registerLangfuseFlush(flush);
    const defer: FlushDefer = vi.fn();

    scheduleFlush(defer);

    expect(defer).toHaveBeenCalledOnce();
    expect(flush).not.toHaveBeenCalled();
  });
});
