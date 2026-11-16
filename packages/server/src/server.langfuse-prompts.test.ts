import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfigFromEnv } from "./server.js";

const requiredEnv = {
  CTP_PROJECT_KEY: "project",
  CTP_CLIENT_ID: "client",
  CTP_CLIENT_SECRET: "secret",
  CTP_REGION: "eu-central-1",
  OPENROUTER_API_KEY: "or-key",
};

describe("loadConfigFromEnv langfuse prompts", () => {
  const previous = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const [key, value] of Object.entries(requiredEnv)) {
      previous.set(key, process.env[key]);
      process.env[key] = value;
    }
    for (const key of [
      "LANGFUSE_PUBLIC_KEY",
      "LANGFUSE_SECRET_KEY",
      "LANGFUSE_PROMPTS",
      "LANGFUSE_PROMPT_LABEL",
      "LANGFUSE_PROMPT_CACHE_TTL_SECONDS",
      "LANGFUSE_PROMPT_FETCH_TIMEOUT_MS",
      "LANGFUSE_PROMPT_MAX_RETRIES",
      "CAT_AI_PROVIDER",
      "OPENROUTER_JSON_SCHEMA",
    ]) {
      previous.set(key, process.env[key]);
      delete process.env[key];
    }
    process.env.CAT_AI_PROVIDER = "openrouter";
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

  it("maps prompt management env into langfuse config", () => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk";
    process.env.LANGFUSE_SECRET_KEY = "sk";
    process.env.LANGFUSE_PROMPTS = "true";
    process.env.LANGFUSE_PROMPT_LABEL = "staging";
    process.env.LANGFUSE_PROMPT_CACHE_TTL_SECONDS = "90";

    const config = loadConfigFromEnv();

    expect(config.langfuse).toEqual({
      enabled: true,
      promptsEnabled: true,
      promptLabel: "staging",
      promptCacheTtlSeconds: 90,
    });
  });

  it("fails at boot on an invalid prompt cache TTL", () => {
    process.env.LANGFUSE_PROMPT_CACHE_TTL_SECONDS = "nope";
    expect(() => loadConfigFromEnv()).toThrow("Invalid LANGFUSE_PROMPT_CACHE_TTL_SECONDS");
  });

  it("maps prompt fetch timeout and retry env into langfuse config", () => {
    process.env.LANGFUSE_PROMPT_FETCH_TIMEOUT_MS = "1500";
    process.env.LANGFUSE_PROMPT_MAX_RETRIES = "0";

    const config = loadConfigFromEnv();

    expect(config.langfuse?.promptFetchTimeoutMs).toBe(1500);
    expect(config.langfuse?.promptMaxRetries).toBe(0);
  });

  it("accepts a positive prompt retry count", () => {
    process.env.LANGFUSE_PROMPT_MAX_RETRIES = "2";
    expect(loadConfigFromEnv().langfuse?.promptMaxRetries).toBe(2);
  });

  it("fails at boot on an invalid prompt fetch timeout or retry count", () => {
    process.env.LANGFUSE_PROMPT_FETCH_TIMEOUT_MS = "0";
    expect(() => loadConfigFromEnv()).toThrow("Invalid LANGFUSE_PROMPT_FETCH_TIMEOUT_MS");
    process.env.LANGFUSE_PROMPT_FETCH_TIMEOUT_MS = "fast";
    expect(() => loadConfigFromEnv()).toThrow("Invalid LANGFUSE_PROMPT_FETCH_TIMEOUT_MS");
    delete process.env.LANGFUSE_PROMPT_FETCH_TIMEOUT_MS;

    process.env.LANGFUSE_PROMPT_MAX_RETRIES = "-1";
    expect(() => loadConfigFromEnv()).toThrow("Invalid LANGFUSE_PROMPT_MAX_RETRIES");
  });

  it("leaves prompts disabled and the TTL unset by default", () => {
    const config = loadConfigFromEnv();

    expect(config.langfuse?.promptFetchTimeoutMs).toBeUndefined();
    expect(config.langfuse?.promptMaxRetries).toBeUndefined();

    expect(config.langfuse?.promptCacheTtlSeconds).toBeUndefined();
    expect(config.langfuse?.promptsEnabled).toBe(false);
    expect(config.langfuse?.enabled).toBe(false);
  });

  it("disables OpenRouter json_schema when OPENROUTER_JSON_SCHEMA=false", () => {
    process.env.OPENROUTER_JSON_SCHEMA = "false";

    const config = loadConfigFromEnv();

    expect(config.ai.openrouter?.jsonSchema).toBe(false);
  });

  it("leaves OpenRouter json_schema enabled by default", () => {
    const config = loadConfigFromEnv();

    expect(config.ai.openrouter?.jsonSchema).toBeUndefined();
  });
});
