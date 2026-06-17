import { afterEach, describe, expect, it, vi } from "vitest";
import { logServerError, logServerWarning } from "./log-error.js";

describe("logServerError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("logs error details in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    logServerError("searchVoice", new Error("transcription failed"), { mimeType: "audio/webm" });

    expect(errorSpy).toHaveBeenCalled();
    expect(errorSpy.mock.calls[0]?.[0]).toContain("searchVoice");
    expect(errorSpy.mock.calls[0]?.[0]).toContain("transcription failed");
  });

  it("does not log in production without CAT_DEBUG", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CAT_DEBUG", "");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    logServerError("search", new Error("hidden"));

    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe("logServerWarning", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("logs warnings in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    logServerWarning("searchVoice", "TTS summary skipped");

    expect(warnSpy).toHaveBeenCalledWith(
      "[commerce-ai-tool/server] searchVoice: TTS summary skipped",
    );
  });
});
