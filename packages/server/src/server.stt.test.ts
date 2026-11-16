import { inspect } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const convert = vi.fn();
const ttsConvert = vi.fn();

vi.mock("@elevenlabs/elevenlabs-js", () => ({
  ElevenLabsClient: class {
    speechToText = { convert };
    textToSpeech = { convert: ttsConvert };
  },
}));

vi.mock("@commerce-ai-tool/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@commerce-ai-tool/core")>();
  return {
    ...actual,
    createCommercetoolsClient: vi.fn(() => ({})),
    createSearchOrchestrator: vi.fn(() => ({})),
  };
});

import type { CommerceAIConfig } from "@commerce-ai-tool/core";
import { createCommerceAIServer } from "./server.js";

const TEST_SESSION_SECRET = "test-session-secret-0123456789abcdef";

function config(sttModel?: string): CommerceAIConfig {
  return {
    commercetools: { projectKey: "p", clientId: "c", clientSecret: "s", region: "eu" },
    cartSession: { secret: TEST_SESSION_SECRET },
    ai: { provider: "openrouter", openrouter: { apiKey: "k" } },
    elevenlabs: { apiKey: "xi", sttModel },
  };
}

function configWithoutSecret(): CommerceAIConfig {
  return { ...config(), cartSession: undefined };
}

async function transcribeModel(sttModel?: string): Promise<unknown> {
  const server = createCommerceAIServer({ config: config(sttModel) });
  await server.transcribeAudio(Buffer.from("audio"), "audio/wav");
  return convert.mock.calls.at(-1)?.[0]?.modelId;
}

describe("STT model selection", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    convert.mockReset();
    convert.mockResolvedValue({ text: "hello" });
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it("defaults to scribe_v2 without a warning", async () => {
    expect(await transcribeModel(undefined)).toBe("scribe_v2");
    expect(warn).not.toHaveBeenCalled();
  });

  it("ELEVENLABS_STT_MODEL=scribe_v1 is honoured", async () => {
    expect(await transcribeModel("scribe_v1")).toBe("scribe_v1");
    expect(warn).not.toHaveBeenCalled();
  });

  it.each(["scribe_v2", "scribe_v2_medical", "scribe_v3"])("honours %s", async (model) => {
    expect(await transcribeModel(` ${model} `)).toBe(model);
    expect(warn).not.toHaveBeenCalled();
  });

  it("unknown STT model falls back to scribe_v2 with a warning", async () => {
    expect(await transcribeModel("scribe_v9")).toBe("scribe_v2");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("scribe_v9");
  });

  it("warns once at startup, not on every transcription", async () => {
    const server = createCommerceAIServer({ config: config("nope") });
    await server.transcribeAudio(Buffer.from("a"), "audio/wav");
    await server.transcribeAudio(Buffer.from("b"), "audio/wav");
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("cart session secret", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    delete (globalThis as Record<symbol, unknown>)[Symbol.for("commerce-ai-tool.ephemeralCartSessionSecret")];
  });

  const strongSecret = "x".repeat(32);

  it("uses config.cartSession.secret, trimmed", () => {
    const server = createCommerceAIServer({
      config: { ...configWithoutSecret(), cartSession: { secret: `  ${strongSecret}  ` } },
    });
    expect(server.cartSessionSecret).toBe(strongSecret);
  });

  it("ignores process.env.CAT_CART_SESSION_SECRET inside createCommerceAIServer", () => {
    vi.stubEnv("CAT_CART_SESSION_SECRET", strongSecret);
    expect(createCommerceAIServer({ config: configWithoutSecret() }).cartSessionSecret).not.toBe(strongSecret);
  });

  it("createCommerceAIServer throws in production without a 32+ byte CAT_CART_SESSION_SECRET", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => createCommerceAIServer({ config: configWithoutSecret() })).toThrow(/CAT_CART_SESSION_SECRET/);
    expect(() =>
      createCommerceAIServer({ config: { ...configWithoutSecret(), cartSession: { secret: "   " } } }),
    ).toThrow(/CAT_CART_SESSION_SECRET/);
    // 31 bytes: too short. The commercetools client secret is never used as a fallback.
    expect(() =>
      createCommerceAIServer({ config: { ...configWithoutSecret(), cartSession: { secret: "y".repeat(31) } } }),
    ).toThrow(/at least 32 bytes/);

    const ok = createCommerceAIServer({
      config: { ...configWithoutSecret(), cartSession: { secret: strongSecret } },
    });
    expect(ok.cartSessionSecret).toBe(strongSecret);
  });

  it("measures the secret in UTF-8 bytes, not characters", () => {
    vi.stubEnv("NODE_ENV", "production");
    // 16 characters, 32 bytes (2 bytes each): accepted. 31 characters would be rejected as ASCII.
    const twoByte = "é".repeat(16);
    expect(Buffer.byteLength(twoByte, "utf8")).toBe(32);
    expect(
      createCommerceAIServer({ config: { ...configWithoutSecret(), cartSession: { secret: twoByte } } })
        .cartSessionSecret,
    ).toBe(twoByte);
    const fifteen = "é".repeat(15);
    expect(() =>
      createCommerceAIServer({ config: { ...configWithoutSecret(), cartSession: { secret: fifteen } } }),
    ).toThrow(/at least 32 bytes/);
  });

  it("never echoes the secret in the startup error", () => {
    vi.stubEnv("NODE_ENV", "production");
    const weak = "weak-secret-value";
    try {
      createCommerceAIServer({ config: { ...configWithoutSecret(), cartSession: { secret: weak } } });
      expect.unreachable();
    } catch (error) {
      expect(String((error as Error).message)).not.toContain(weak);
    }
  });

  it("unset NODE_ENV and a missing secret throws", () => {
    vi.stubEnv("NODE_ENV", undefined as unknown as string);
    expect(process.env.NODE_ENV).toBeUndefined();
    expect(() => createCommerceAIServer({ config: configWithoutSecret() })).toThrow(
      /CAT_CART_SESSION_SECRET.*NODE_ENV is not set/s,
    );
  });

  it("NODE_ENV=staging with a 6-byte secret throws, and so does a missing secret", () => {
    vi.stubEnv("NODE_ENV", "staging");
    expect(() =>
      createCommerceAIServer({ config: { ...configWithoutSecret(), cartSession: { secret: "abcdef" } } }),
    ).toThrow(/at least 32 bytes/);
    expect(() => createCommerceAIServer({ config: configWithoutSecret() })).toThrow(
      /NODE_ENV is "staging"/,
    );
  });

  it("enforces the 32-byte minimum in development and test too", () => {
    for (const env of ["development", "test"]) {
      vi.stubEnv("NODE_ENV", env);
      expect(() =>
        createCommerceAIServer({ config: { ...configWithoutSecret(), cartSession: { secret: "short-dev-secret" } } }),
      ).toThrow(/at least 32 bytes/);
    }
  });

  it("development with a missing secret uses one ephemeral secret per process and warns once", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.resetModules();
    const { createCommerceAIServer: create } = await import("./server.js");

    const first = create({ config: configWithoutSecret() });
    const second = create({ config: configWithoutSecret() });

    expect(first.cartSessionSecret).not.toBe("s");
    expect(Buffer.byteLength(first.cartSessionSecret, "utf8")).toBeGreaterThanOrEqual(32);
    expect(second.cartSessionSecret).toBe(first.cartSessionSecret);
    const warnings = warn.mock.calls.filter((call) => String(call[0]).includes("CAT_CART_SESSION_SECRET"));
    expect(warnings).toHaveLength(1);
  });

  it("test environment with a missing secret also gets an ephemeral secret", () => {
    vi.stubEnv("NODE_ENV", "test");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const server = createCommerceAIServer({ config: configWithoutSecret() });
    expect(Buffer.byteLength(server.cartSessionSecret, "utf8")).toBeGreaterThanOrEqual(32);
    warn.mockRestore();
  });

  it("does not warn when a valid secret is configured", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.resetModules();
    const { createCommerceAIServer: create } = await import("./server.js");
    create({ config: { ...configWithoutSecret(), cartSession: { secret: strongSecret } } });
    expect(
      warn.mock.calls.filter((call) => String(call[0]).includes("CAT_CART_SESSION_SECRET")),
    ).toHaveLength(0);
  });

  it("keeps the secret readable but out of enumeration, JSON and inspection", () => {
    const server = createCommerceAIServer({
      config: { ...configWithoutSecret(), cartSession: { secret: strongSecret } },
    });
    expect(server.cartSessionSecret).toBe(strongSecret);
    expect(Object.keys(server)).not.toContain("cartSessionSecret");
    expect(JSON.stringify(server)).not.toContain(strongSecret);
    expect({ ...server }).not.toHaveProperty("cartSessionSecret");
    expect(inspect(server, { depth: 4 })).not.toContain(strongSecret);
  });
});

describe("supported locales at boot", () => {
  it("createCommerceAIServer throws when no supportedLocales entry is valid", () => {
    expect(() =>
      createCommerceAIServer({ config: { ...config(), supportedLocales: ["en_GB"] } }),
    ).toThrow("Invalid CAT_SUPPORTED_LOCALES");
  });

  it("keeps valid entries of a partially invalid list", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const server = createCommerceAIServer({
      config: { ...config(), supportedLocales: ["en_GB", "de-de"] },
    });
    expect(server.supportedLocales).toEqual(["de-DE"]);
    warn.mockRestore();
  });
});

describe("TTS request cancellation", () => {
  it("passes the request signal to ElevenLabs as abortSignal", async () => {
    ttsConvert.mockReset();
    ttsConvert.mockResolvedValue(
      (async function* () {
        yield new Uint8Array([1, 2, 3]);
      })(),
    );
    const controller = new AbortController();
    const server = createCommerceAIServer({ config: config() });

    const audio = await server.synthesizeSpeech("hello", controller.signal);

    expect(audio).toEqual(Buffer.from([1, 2, 3]));
    expect(ttsConvert.mock.calls[0]?.[2]).toEqual({ abortSignal: controller.signal });
  });
});
