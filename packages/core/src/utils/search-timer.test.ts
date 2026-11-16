import { afterEach, describe, expect, it, vi } from "vitest";
import { createSearchTimer, shouldIncludeSearchTimings } from "./search-timer.js";

describe("createSearchTimer", () => {
  it("records step durations and total time", async () => {
    const timer = createSearchTimer();
    await new Promise((resolve) => setTimeout(resolve, 5));
    timer.mark("step_a");
    await new Promise((resolve) => setTimeout(resolve, 5));
    timer.mark("step_b");

    const result = timer.finish();

    expect(result.steps.step_a).toBeGreaterThanOrEqual(4);
    expect(result.steps.step_b).toBeGreaterThanOrEqual(4);
    expect(result.totalMs).toBeGreaterThanOrEqual(8);
  });
});

describe("shouldIncludeSearchTimings", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("timings are omitted when NODE_ENV is unset and CAT_DEBUG is unset", () => {
    vi.stubEnv("NODE_ENV", "");
    vi.stubEnv("CAT_DEBUG", "");
    expect(shouldIncludeSearchTimings()).toBe(false);
  });

  it("timings are omitted in development without CAT_DEBUG", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("CAT_DEBUG", "");
    expect(shouldIncludeSearchTimings()).toBe(false);
  });

  it("timings are included with CAT_DEBUG=true", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CAT_DEBUG", "true");
    expect(shouldIncludeSearchTimings()).toBe(true);
  });
});
