import { describe, expect, it, vi, afterEach } from "vitest";
import { logSearchTrace } from "./dev-trace.js";

describe("logSearchTrace", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("logs in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    logSearchTrace("input", { query: "shoes" });

    expect(infoSpy).toHaveBeenCalledWith(
      "[commerce-ai-tool/core] search.trace input:",
      JSON.stringify({ query: "shoes" }, null, 2),
    );
  });

  it("does not log in production without CAT_DEBUG", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CAT_DEBUG", "");
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    logSearchTrace("input", { query: "shoes" });

    expect(infoSpy).not.toHaveBeenCalled();
  });
});
