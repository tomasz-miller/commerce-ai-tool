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

  it("logs handler name and error class in production without request payload", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CAT_DEBUG", "");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    logServerError("search", new TypeError("upstream exploded"), { query: "red shoes" });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const line = String(errorSpy.mock.calls[0]?.[0]);
    expect(line).toContain("search");
    expect(line).toContain("TypeError");
    expect(line).toContain("upstream exploded");
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("red shoes");
  });

  it("production error log redacts a quoted invalid value and an email", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CAT_DEBUG", "");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    logServerError(
      "createOrder",
      new Error(
        `The value 'shopper@example.test' is not valid for field "email" and "Jane Roe" was rejected; contact shopper@example.test or +48 000 000 000`,
      ),
    );

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const line = String(errorSpy.mock.calls[0]?.[0]);
    expect(line).toContain("createOrder");
    expect(line).toContain("Error");
    expect(line).not.toContain("shopper@example.test");
    expect(line).not.toContain("Jane Roe");
    expect(line).not.toContain("+48 000 000 000");
    expect(line).toContain('"[redacted]"');
    expect(line).toContain("is not valid for field");
  });

  it("redacts an unterminated quoted value", () => {
    vi.stubEnv("CAT_DEBUG", "");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    logServerError("createOrder", new Error(`Invalid value "Jane Roe and more text`));
    logServerError("createOrder", new Error(`Invalid value 'Jane Roe and more text`));

    for (const call of errorSpy.mock.calls) {
      const line = String(call[0]);
      expect(line).toContain("Invalid value");
      expect(line).not.toContain("Jane Roe");
      expect(line).not.toContain("more text");
    }
  });

  it("keeps in-word apostrophes", () => {
    vi.stubEnv("CAT_DEBUG", "");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    logServerError("search", new Error("It's John's order, the shopper's cart isn't ready"));

    expect(String(errorSpy.mock.calls[0]?.[0])).toContain(
      "It's John's order, the shopper's cart isn't ready",
    );
  });

  it("redacts a single-quoted value but not the text around it", () => {
    vi.stubEnv("CAT_DEBUG", "");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    logServerError("search", new Error("field 'email' rejected 'Jane Roe' twice"));

    const line = String(errorSpy.mock.calls[0]?.[0]);
    expect(line).toContain('field "[redacted]" rejected "[redacted]" twice');
  });

  it("production error log names the ApiErrorCode when it is known", () => {
    vi.stubEnv("CAT_DEBUG", "");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    logServerError("search", new Error("boom"), undefined, "INTERNAL");

    expect(String(errorSpy.mock.calls[0]?.[0])).toContain("INTERNAL");
  });

  it("CAT_DEBUG logs the full message", () => {
    vi.stubEnv("CAT_DEBUG", "true");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    logServerError("createOrder", new Error(`The value "Jane Roe" is not valid (shopper@example.test)`));

    const line = String(errorSpy.mock.calls[0]?.[0]);
    expect(line).toContain("Jane Roe");
    expect(line).toContain("shopper@example.test");
  });

  it("logs request payload and stack only with CAT_DEBUG=true", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CAT_DEBUG", "true");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    logServerError("search", new Error("boom"), { query: "red shoes" });

    const logged = JSON.stringify(errorSpy.mock.calls);
    expect(logged).toContain("red shoes");
    expect(logged).toContain("log-error.test");
  });

  it("does not log payload or stack when NODE_ENV is unset and CAT_DEBUG is off", () => {
    vi.stubEnv("NODE_ENV", "");
    vi.stubEnv("CAT_DEBUG", "");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    logServerError("search", new Error("boom"), { query: "red shoes" });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("red shoes");
  });
});

describe("logServerWarning", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("logs a fixed warning in production and the context only with CAT_DEBUG", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CAT_DEBUG", "");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    logServerWarning("searchVoice", "TTS summary skipped", { reason: "shopper@example.test" });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith("[commerce-ai-tool/server] searchVoice: TTS summary skipped");

    vi.stubEnv("CAT_DEBUG", "true");
    logServerWarning("searchVoice", "TTS summary skipped", { reason: "shopper@example.test" });
    expect(JSON.stringify(warnSpy.mock.calls)).toContain("shopper@example.test");
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
