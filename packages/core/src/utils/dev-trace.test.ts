import { describe, expect, it, vi, afterEach } from "vitest";
import { logSearchTrace } from "./dev-trace.js";

function loggedLine(infoSpy: ReturnType<typeof vi.spyOn>): string {
  return String(infoSpy.mock.calls[0]?.[1]);
}

describe("logSearchTrace", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("verbose trace is off when NODE_ENV is unset and CAT_DEBUG is unset", () => {
    vi.stubEnv("NODE_ENV", "");
    vi.stubEnv("CAT_DEBUG", "");
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    logSearchTrace("input", { query: "shoes" });

    expect(infoSpy).not.toHaveBeenCalled();
  });

  it("does not trace in development without CAT_DEBUG", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("CAT_DEBUG", "");
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    logSearchTrace("input", { query: "shoes" });

    expect(infoSpy).not.toHaveBeenCalled();
  });

  it("does not trace in production without CAT_DEBUG", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CAT_DEBUG", "");
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    logSearchTrace("input", { query: "shoes" });

    expect(infoSpy).not.toHaveBeenCalled();
  });

  it("CAT_DEBUG logs the query length and a hash instead of the raw text", () => {
    vi.stubEnv("CAT_DEBUG", "true");
    vi.stubEnv("CAT_DEBUG_RAW", "");
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    logSearchTrace("input", { query: "red shoes for shopper@example.test", queryLocale: "en" });

    expect(infoSpy.mock.calls[0]?.[0]).toBe("[commerce-ai-tool/core] search.trace input:");
    const logged = JSON.parse(loggedLine(infoSpy)) as Record<string, unknown>;
    expect(logged.query).toBeUndefined();
    expect(logged.queryLength).toBe("red shoes for shopper@example.test".length);
    expect(logged.queryHash).toMatch(/^[0-9a-f]{12}$/);
    expect(logged.queryLocale).toBe("en");
    expect(loggedLine(infoSpy)).not.toContain("shopper@example.test");
  });

  it("the hash is stable per text and differs between texts", () => {
    vi.stubEnv("CAT_DEBUG", "true");
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    logSearchTrace("input", { query: "shoes" });
    logSearchTrace("input", { query: "shoes" });
    logSearchTrace("input", { query: "boots" });

    const hashes = infoSpy.mock.calls.map(
      (call) => (JSON.parse(String(call[1])) as { queryHash: string }).queryHash,
    );
    expect(hashes[0]).toBe(hashes[1]);
    expect(hashes[0]).not.toBe(hashes[2]);
  });

  it("CAT_DEBUG_RAW=true logs the raw query", () => {
    vi.stubEnv("CAT_DEBUG", "true");
    vi.stubEnv("CAT_DEBUG_RAW", "true");
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    logSearchTrace("input", { query: "shoes" });

    expect(infoSpy).toHaveBeenCalledWith(
      "[commerce-ai-tool/core] search.trace input:",
      JSON.stringify({ query: "shoes" }, null, 2),
    );
  });

  it("CAT_DEBUG_RAW alone does not enable tracing", () => {
    vi.stubEnv("CAT_DEBUG", "");
    vi.stubEnv("CAT_DEBUG_RAW", "true");
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    logSearchTrace("input", { query: "shoes" });

    expect(infoSpy).not.toHaveBeenCalled();
  });

  it("leaves data without raw text keys untouched", () => {
    vi.stubEnv("CAT_DEBUG", "true");
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    logSearchTrace("timings", { totalMs: 12 });

    expect(infoSpy).toHaveBeenCalledWith(
      "[commerce-ai-tool/core] search.trace timings:",
      JSON.stringify({ totalMs: 12 }, null, 2),
    );
  });
});
