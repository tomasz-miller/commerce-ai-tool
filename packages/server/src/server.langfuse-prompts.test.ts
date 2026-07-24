import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
      "CAT_AI_PROVIDER",
    ]) {
      previous.set(key, process.env[key]);
      delete process.env[key];
    }
    process.env.CAT_AI_PROVIDER = "openrouter";
    vi.resetModules();
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
    vi.resetModules();
  });

  it("maps prompt management env into langfuse config", async () => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk";
    process.env.LANGFUSE_SECRET_KEY = "sk";
    process.env.LANGFUSE_PROMPTS = "true";
    process.env.LANGFUSE_PROMPT_LABEL = "staging";
    process.env.LANGFUSE_PROMPT_CACHE_TTL_SECONDS = "90";

    const { loadConfigFromEnv } = await import("./server.js");
    const config = loadConfigFromEnv();

    expect(config.langfuse).toEqual({
      enabled: true,
      promptsEnabled: true,
      promptLabel: "staging",
      promptCacheTtlSeconds: 90,
    });
  });

  it("ignores invalid prompt cache TTL and leaves prompts disabled by default", async () => {
    process.env.LANGFUSE_PROMPT_CACHE_TTL_SECONDS = "nope";

    const { loadConfigFromEnv } = await import("./server.js");
    const config = loadConfigFromEnv();

    expect(config.langfuse?.promptCacheTtlSeconds).toBeUndefined();
    expect(config.langfuse?.promptsEnabled).toBe(false);
    expect(config.langfuse?.enabled).toBe(false);
  });
});
