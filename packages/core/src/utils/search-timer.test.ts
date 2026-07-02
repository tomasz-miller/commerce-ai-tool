import { describe, expect, it } from "vitest";
import { createSearchTimer } from "./search-timer.js";

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
