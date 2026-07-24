import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SYSTEM_PROMPT_CATALOG,
  SYSTEM_PROMPT_NAMES,
  getLocalSystemPrompt,
  listSystemPromptEntries,
} from "./catalog.js";
import {
  _resetLangfusePromptRuntimeForTests,
  _setLangfusePromptClientFactoryForTests,
  configureLangfusePrompts,
  resolveAndLinkSystemPrompt,
  resolveSystemPrompt,
} from "./resolve.js";
import { TTS_SUMMARY_PROMPT } from "./index.js";

vi.mock("@langfuse/tracing", () => ({
  updateActiveObservation: vi.fn(),
}));

import { updateActiveObservation } from "@langfuse/tracing";

describe("SYSTEM_PROMPT_CATALOG", () => {
  it("includes all six managed system prompts", () => {
    const names = Object.values(SYSTEM_PROMPT_NAMES);
    expect(names).toHaveLength(6);
    expect(listSystemPromptEntries()).toHaveLength(6);
    for (const name of names) {
      expect(getLocalSystemPrompt(name).length).toBeGreaterThan(20);
      expect(SYSTEM_PROMPT_CATALOG[name]).toBe(getLocalSystemPrompt(name));
    }
  });

  it("includes TTS summary from prompts module", () => {
    expect(getLocalSystemPrompt(SYSTEM_PROMPT_NAMES.TTS_SUMMARY)).toBe(TTS_SUMMARY_PROMPT);
  });
});

describe("resolveSystemPrompt", () => {
  const clearEnv = () => {
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_PROMPTS;
    delete process.env.LANGFUSE_PROMPT_LABEL;
    delete process.env.LANGFUSE_PROMPT_CACHE_TTL_SECONDS;
    delete process.env.CAT_DEBUG;
    _resetLangfusePromptRuntimeForTests();
    vi.mocked(updateActiveObservation).mockClear();
  };

  beforeEach(clearEnv);
  afterEach(clearEnv);

  it("returns local catalog when prompts are disabled", async () => {
    const resolved = await resolveSystemPrompt(SYSTEM_PROMPT_NAMES.TEXT_QUERY);
    expect(resolved.source).toBe("local");
    expect(resolved.text).toBe(getLocalSystemPrompt(SYSTEM_PROMPT_NAMES.TEXT_QUERY));
    expect(resolved.prompt).toBeUndefined();
  });

  it("returns local catalog when keys are set but LANGFUSE_PROMPTS is off", async () => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk";
    process.env.LANGFUSE_SECRET_KEY = "sk";
    const resolved = await resolveSystemPrompt(SYSTEM_PROMPT_NAMES.IMAGE_QUERY);
    expect(resolved.source).toBe("local");
    expect(resolved.text).toBe(getLocalSystemPrompt(SYSTEM_PROMPT_NAMES.IMAGE_QUERY));
  });

  it("honors configureLangfusePrompts promptsEnabled over missing LANGFUSE_PROMPTS", async () => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk";
    process.env.LANGFUSE_SECRET_KEY = "sk";
    configureLangfusePrompts({
      promptsEnabled: true,
      promptLabel: "staging",
      promptCacheTtlSeconds: 30,
    });

    const get = vi.fn().mockResolvedValue({
      prompt: "From config-enabled Langfuse",
      isFallback: false,
    });
    _setLangfusePromptClientFactoryForTests(() => ({ prompt: { get } }) as never);

    const resolved = await resolveSystemPrompt(SYSTEM_PROMPT_NAMES.TEXT_QUERY);
    expect(resolved.source).toBe("langfuse");
    expect(resolved.text).toBe("From config-enabled Langfuse");
    expect(get).toHaveBeenCalledWith(SYSTEM_PROMPT_NAMES.TEXT_QUERY, {
      type: "text",
      label: "staging",
      fallback: getLocalSystemPrompt(SYSTEM_PROMPT_NAMES.TEXT_QUERY),
      cacheTtlSeconds: 30,
    });
  });

  it("passes label, fallback, and cache TTL from env to prompt.get", async () => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk";
    process.env.LANGFUSE_SECRET_KEY = "sk";
    process.env.LANGFUSE_PROMPTS = "true";
    process.env.LANGFUSE_PROMPT_LABEL = "canary";
    process.env.LANGFUSE_PROMPT_CACHE_TTL_SECONDS = "120";

    const get = vi.fn().mockResolvedValue({
      prompt: "Remote",
      isFallback: false,
    });
    _setLangfusePromptClientFactoryForTests(() => ({ prompt: { get } }) as never);

    await resolveSystemPrompt(SYSTEM_PROMPT_NAMES.VOICE_ENHANCE);
    expect(get).toHaveBeenCalledWith(SYSTEM_PROMPT_NAMES.VOICE_ENHANCE, {
      type: "text",
      label: "canary",
      fallback: getLocalSystemPrompt(SYSTEM_PROMPT_NAMES.VOICE_ENHANCE),
      cacheTtlSeconds: 120,
    });
  });

  it("returns Langfuse text when prompts are enabled and fetch succeeds", async () => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk";
    process.env.LANGFUSE_SECRET_KEY = "sk";
    process.env.LANGFUSE_PROMPTS = "true";

    const remoteText = "Remote managed system prompt";
    const promptClient = {
      prompt: remoteText,
      isFallback: false,
    };

    _setLangfusePromptClientFactoryForTests(() => ({
      prompt: {
        get: vi.fn().mockResolvedValue(promptClient),
      },
    }) as never);

    const resolved = await resolveSystemPrompt(SYSTEM_PROMPT_NAMES.VOICE_ENHANCE);
    expect(resolved.source).toBe("langfuse");
    expect(resolved.text).toBe(remoteText);
    expect(resolved.prompt).toBe(promptClient);
  });

  it("preserves leading/trailing whitespace from remote prompts", async () => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk";
    process.env.LANGFUSE_SECRET_KEY = "sk";
    process.env.LANGFUSE_PROMPTS = "true";

    const remoteText = "  keep spaces  \n";
    _setLangfusePromptClientFactoryForTests(() => ({
      prompt: {
        get: vi.fn().mockResolvedValue({ prompt: remoteText, isFallback: false }),
      },
    }) as never);

    const resolved = await resolveSystemPrompt(SYSTEM_PROMPT_NAMES.TTS_SUMMARY);
    expect(resolved.source).toBe("langfuse");
    expect(resolved.text).toBe(remoteText);
  });

  it("falls back to local when remote prompt is whitespace-only", async () => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk";
    process.env.LANGFUSE_SECRET_KEY = "sk";
    process.env.LANGFUSE_PROMPTS = "true";

    _setLangfusePromptClientFactoryForTests(() => ({
      prompt: {
        get: vi.fn().mockResolvedValue({ prompt: "   \n\t  ", isFallback: false }),
      },
    }) as never);

    const resolved = await resolveSystemPrompt(SYSTEM_PROMPT_NAMES.TTS_SUMMARY);
    expect(resolved.source).toBe("local");
    expect(resolved.text).toBe(getLocalSystemPrompt(SYSTEM_PROMPT_NAMES.TTS_SUMMARY));
    expect(resolved.prompt).toBeUndefined();
  });

  it("fails open to local when Langfuse get throws", async () => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk";
    process.env.LANGFUSE_SECRET_KEY = "sk";
    process.env.LANGFUSE_PROMPTS = "true";
    process.env.CAT_DEBUG = "true";

    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    _setLangfusePromptClientFactoryForTests(() => ({
      prompt: {
        get: vi.fn().mockRejectedValue(new Error("network")),
      },
    }) as never);

    const resolved = await resolveSystemPrompt(SYSTEM_PROMPT_NAMES.TTS_SUMMARY);
    expect(resolved.source).toBe("local");
    expect(resolved.text).toBe(getLocalSystemPrompt(SYSTEM_PROMPT_NAMES.TTS_SUMMARY));
    expect(info).toHaveBeenCalledWith(
      expect.stringContaining("langfuse_prompt_fetch_failed"),
      expect.stringContaining("network"),
    );

    info.mockRestore();
  });

  it("treats isFallback prompts as local source without linking prompt object", async () => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk";
    process.env.LANGFUSE_SECRET_KEY = "sk";
    process.env.LANGFUSE_PROMPTS = "true";

    const local = getLocalSystemPrompt(SYSTEM_PROMPT_NAMES.SUGGEST_SEARCH_TERMS);
    _setLangfusePromptClientFactoryForTests(() => ({
      prompt: {
        get: vi.fn().mockResolvedValue({
          prompt: local,
          isFallback: true,
        }),
      },
    }) as never);

    const resolved = await resolveSystemPrompt(SYSTEM_PROMPT_NAMES.SUGGEST_SEARCH_TERMS);
    expect(resolved.source).toBe("local");
    expect(resolved.text).toBe(local);
    expect(resolved.prompt).toBeUndefined();
  });

  it("resolveAndLinkSystemPrompt links only Langfuse-sourced prompts", async () => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk";
    process.env.LANGFUSE_SECRET_KEY = "sk";
    process.env.LANGFUSE_PROMPTS = "true";

    const promptClient = { prompt: "Managed", isFallback: false };
    _setLangfusePromptClientFactoryForTests(() => ({
      prompt: {
        get: vi.fn().mockResolvedValue(promptClient),
      },
    }) as never);

    const text = await resolveAndLinkSystemPrompt(SYSTEM_PROMPT_NAMES.TEXT_QUERY);
    expect(text).toBe("Managed");
    expect(updateActiveObservation).toHaveBeenCalledWith(
      { prompt: promptClient },
      { asType: "generation" },
    );
  });

  it("resolveAndLinkSystemPrompt does not link local fallbacks", async () => {
    const text = await resolveAndLinkSystemPrompt(SYSTEM_PROMPT_NAMES.TEXT_QUERY);
    expect(text).toBe(getLocalSystemPrompt(SYSTEM_PROMPT_NAMES.TEXT_QUERY));
    expect(updateActiveObservation).not.toHaveBeenCalled();
  });
});
