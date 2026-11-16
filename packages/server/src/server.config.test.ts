import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveMissionOptions } from "@commerce-ai-tool/core/internal";
import { loadConfigFromEnv } from "./server.js";

const env = {
  CTP_PROJECT_KEY: "project",
  CTP_CLIENT_ID: "client",
  CTP_CLIENT_SECRET: "secret",
  CTP_REGION: "eu-central-1",
  OPENROUTER_API_KEY: "or-key",
  CAT_AI_PROVIDER: "openrouter",
};

describe("loadConfigFromEnv CAT_SUPPORTED_LOCALES", () => {
  const previous = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const key of [...Object.keys(env), "CAT_SUPPORTED_LOCALES"]) {
      previous.set(key, process.env[key]);
      delete process.env[key];
    }
    Object.assign(process.env, env);
  });

  afterEach(() => {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    previous.clear();
  });

  it("is undefined when the variable is unset or empty", () => {
    expect(loadConfigFromEnv().supportedLocales).toBeUndefined();
    process.env.CAT_SUPPORTED_LOCALES = " , ";
    expect(loadConfigFromEnv().supportedLocales).toBeUndefined();
  });

  it("parses a comma-separated list and trims entries", () => {
    process.env.CAT_SUPPORTED_LOCALES = "en-GB, de-DE ,,fr-FR";
    expect(loadConfigFromEnv().supportedLocales).toEqual(["en-GB", "de-DE", "fr-FR"]);
  });
});

describe("loadConfigFromEnv validation", () => {
  const touched = [
    ...Object.keys(env),
    "CAT_CACHE_ENABLED",
    "CAT_CACHE_TTL_MS",
    "CAT_CACHE_MAX_ENTRIES",
    "CAT_DEFAULT_LIMIT",
    "CAT_VOICE_MODE",
    "CAT_MISSIONS_ENABLED",
    "CAT_MISSIONS_MAX_INTENTS",
    "CAT_MISSIONS_PER_INTENT_LIMIT",
    "CAT_MISSIONS_MIN_CONFIDENCE",
    "CAT_FACETS_ENABLED",
    "CAT_FACET_SCHEMA_TTL_MS",
    "CAT_FACET_MAX_ATTRIBUTES",
    "CAT_CART_SESSION_SECRET",
    "CAT_VOICE_LLM_SUMMARY",
    "LANGFUSE_PROMPT_CACHE_TTL_SECONDS",
    "CTP_SCOPES",
    "CAT_LEGACY_PRODUCT_PROJECTION_SEARCH",
  ];
  const previous = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const key of touched) {
      previous.set(key, process.env[key]);
      delete process.env[key];
    }
    Object.assign(process.env, env);
  });

  afterEach(() => {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    previous.clear();
  });

  it("CTP_SCOPES is split on whitespace and unset means no scope parameter", () => {
    expect(loadConfigFromEnv().commercetools.scopes).toBeUndefined();
    process.env.CTP_SCOPES = "   ";
    expect(loadConfigFromEnv().commercetools.scopes).toBeUndefined();
    process.env.CTP_SCOPES = " view_published_products:project  manage_orders:project\nview_payments:project ";
    expect(loadConfigFromEnv().commercetools.scopes).toEqual([
      "view_published_products:project",
      "manage_orders:project",
      "view_payments:project",
    ]);
  });

  it("CAT_LEGACY_PRODUCT_PROJECTION_SEARCH is a strict boolean, unset leaves the default", () => {
    expect(loadConfigFromEnv().commercetools.legacyProductProjectionSearch).toBeUndefined();
    process.env.CAT_LEGACY_PRODUCT_PROJECTION_SEARCH = "false";
    expect(loadConfigFromEnv().commercetools.legacyProductProjectionSearch).toBe(false);
    process.env.CAT_LEGACY_PRODUCT_PROJECTION_SEARCH = "true";
    expect(loadConfigFromEnv().commercetools.legacyProductProjectionSearch).toBe(true);
    process.env.CAT_LEGACY_PRODUCT_PROJECTION_SEARCH = "0";
    expect(() => loadConfigFromEnv()).toThrow("Invalid CAT_LEGACY_PRODUCT_PROJECTION_SEARCH");
  });

  it("throws on CAT_CACHE_MAX_ENTRIES=abc", () => {
    process.env.CAT_CACHE_ENABLED = "true";
    process.env.CAT_CACHE_MAX_ENTRIES = "abc";
    expect(() => loadConfigFromEnv()).toThrow("Invalid CAT_CACHE_MAX_ENTRIES");
  });

  it("a bad CAT_CACHE_MAX_ENTRIES is ignored when the cache is disabled", () => {
    process.env.CAT_CACHE_MAX_ENTRIES = "abc";
    expect(loadConfigFromEnv().cache).toBeUndefined();
    process.env.CAT_CACHE_TTL_MS = "0";
    expect(loadConfigFromEnv().cache).toBeUndefined();
  });

  it("throws on a bad CAT_CACHE_MAX_ENTRIES when a TTL builds the cache", () => {
    process.env.CAT_CACHE_TTL_MS = "1000";
    process.env.CAT_CACHE_MAX_ENTRIES = "abc";
    expect(() => loadConfigFromEnv()).toThrow("Invalid CAT_CACHE_MAX_ENTRIES");
  });

  it("CAT_CACHE_TTL_MS=0 disables the cache and does not throw", () => {
    process.env.CAT_CACHE_TTL_MS = "0";
    expect(loadConfigFromEnv().cache).toBeUndefined();
    process.env.CAT_CACHE_ENABLED = "true";
    expect(loadConfigFromEnv().cache).toEqual({});
  });

  it("rejects a negative CAT_CACHE_TTL_MS", () => {
    process.env.CAT_CACHE_TTL_MS = "-1";
    expect(() => loadConfigFromEnv()).toThrow("Invalid CAT_CACHE_TTL_MS");
  });

  it("throws on CAT_AI_PROVIDER=gpt", () => {
    process.env.CAT_AI_PROVIDER = "gpt";
    expect(() => loadConfigFromEnv()).toThrow("Invalid CAT_AI_PROVIDER");
  });

  it("throws on CAT_VOICE_MODE=typo", () => {
    process.env.CAT_VOICE_MODE = "typo";
    expect(() => loadConfigFromEnv()).toThrow("Invalid CAT_VOICE_MODE");
  });

  it.each([
    "CAT_CACHE_TTL_MS",
    "CAT_DEFAULT_LIMIT",
    "CAT_MISSIONS_MAX_INTENTS",
    "CAT_MISSIONS_PER_INTENT_LIMIT",
    "CAT_MISSIONS_MIN_CONFIDENCE",
    "CAT_FACET_SCHEMA_TTL_MS",
    "CAT_FACET_MAX_ATTRIBUTES",
    "LANGFUSE_PROMPT_CACHE_TTL_SECONDS",
  ])("throws on %s=abc", (name) => {
    process.env[name] = "abc";
    // Feature settings are only parsed when their feature is switched on.
    process.env.CAT_MISSIONS_ENABLED = "true";
    process.env.CAT_FACETS_ENABLED = "true";
    expect(() => loadConfigFromEnv()).toThrow(`Invalid ${name}`);
  });

  it("keeps the current defaults and accepts valid values", () => {
    expect(loadConfigFromEnv()).toMatchObject({
      ai: { provider: "openrouter" },
      voiceMode: undefined,
      defaults: { limit: 20 },
      cache: undefined,
      missions: undefined,
      facets: undefined,
    });
    process.env.CAT_AI_PROVIDER = "bedrock";
    process.env.AWS_REGION = "eu-west-1";
    process.env.CAT_VOICE_MODE = "elevenlabs-stt";
    process.env.CAT_DEFAULT_LIMIT = "50";
    process.env.CAT_CACHE_TTL_MS = "1000";
    process.env.CAT_CACHE_MAX_ENTRIES = "10";
    process.env.CAT_MISSIONS_ENABLED = "true";
    process.env.CAT_MISSIONS_MIN_CONFIDENCE = "0.7";
    process.env.CAT_FACETS_ENABLED = "true";
    process.env.CAT_FACET_MAX_ATTRIBUTES = "8";
    process.env.LANGFUSE_PROMPT_CACHE_TTL_SECONDS = "0";
    try {
      const config = loadConfigFromEnv();
      expect(config.ai.provider).toBe("bedrock");
      expect(config.voiceMode).toBe("elevenlabs-stt");
      expect(config.defaults?.limit).toBe(50);
      expect(config.cache).toEqual({ ttlMs: 1000, maxEntries: 10 });
      expect(config.missions).toMatchObject({ enabled: true, minConfidence: 0.7 });
      expect(config.facets).toMatchObject({ enabled: true, maxAttributes: 8 });
      expect(config.langfuse?.promptCacheTtlSeconds).toBe(0);
    } finally {
      delete process.env.AWS_REGION;
    }
  });

  it("treats empty numeric and enum variables as unset", () => {
    process.env.CAT_DEFAULT_LIMIT = "";
    process.env.CAT_VOICE_MODE = "";
    process.env.CAT_CACHE_TTL_MS = "";
    const config = loadConfigFromEnv();
    expect(config.defaults?.limit).toBe(20);
    expect(config.voiceMode).toBeUndefined();
    expect(config.cache).toBeUndefined();
  });

  it("CAT_MISSIONS_ENABLED=false hard-disables missions even when a request asks for them", () => {
    process.env.CAT_MISSIONS_ENABLED = "false";
    const config = loadConfigFromEnv();
    expect(config.missions).toEqual({ enabled: false });
    expect(resolveMissionOptions(config.missions, true).enabled).toBe(false);
  });

  it("leaves the LLM voice summary off unless CAT_VOICE_LLM_SUMMARY=true", () => {
    expect(loadConfigFromEnv().voice).toBeUndefined();
    process.env.CAT_VOICE_LLM_SUMMARY = "false";
    expect(loadConfigFromEnv().voice).toBeUndefined();
    process.env.CAT_VOICE_LLM_SUMMARY = "true";
    expect(loadConfigFromEnv().voice).toEqual({ llmSummary: true });
  });

  it("throws on CAT_VOICE_LLM_SUMMARY=yes", () => {
    process.env.CAT_VOICE_LLM_SUMMARY = "yes";
    expect(() => loadConfigFromEnv()).toThrow("Invalid CAT_VOICE_LLM_SUMMARY");
  });

  it("CAT_MISSIONS_ENABLED=true keeps missions enabled", () => {
    process.env.CAT_MISSIONS_ENABLED = "true";
    expect(loadConfigFromEnv().missions?.enabled).toBe(true);
  });

  it("reads CAT_CART_SESSION_SECRET into cartSession.secret", () => {
    expect(loadConfigFromEnv().cartSession).toBeUndefined();
    process.env.CAT_CART_SESSION_SECRET = " a-dedicated-secret ";
    expect(loadConfigFromEnv().cartSession).toEqual({ secret: "a-dedicated-secret" });
  });
});
