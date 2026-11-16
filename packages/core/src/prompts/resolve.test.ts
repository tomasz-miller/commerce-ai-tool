import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  REQUIRED_PROMPT_MARKERS,
  SYSTEM_PROMPT_CATALOG,
  SYSTEM_PROMPT_NAMES,
  type SystemPromptName,
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

/** Remote prompt text that carries every marker required for `name`. */
function managedPromptText(name: SystemPromptName, body: string): string {
  return [body, ...REQUIRED_PROMPT_MARKERS[name]].join("\n");
}

describe("SYSTEM_PROMPT_CATALOG", () => {
  it("includes all managed system prompts", () => {
    const names = Object.values(SYSTEM_PROMPT_NAMES);
    expect(names).toHaveLength(9);
    expect(listSystemPromptEntries()).toHaveLength(9);
    expect(names).toContain(SYSTEM_PROMPT_NAMES.MISSION_QUERY);
    expect(names).toContain(SYSTEM_PROMPT_NAMES.REFINE_QUERY);
    expect(names).toContain(SYSTEM_PROMPT_NAMES.VOICE_TRANSCRIPT_INTERPRET);
    for (const name of names) {
      expect(getLocalSystemPrompt(name).length).toBeGreaterThan(20);
      expect(SYSTEM_PROMPT_CATALOG[name]).toBe(getLocalSystemPrompt(name));
    }
  });

  it("every local prompt satisfies its own required markers", () => {
    // If this fails, a fragment changed without updating REQUIRED_PROMPT_MARKERS (catalog.ts).
    for (const name of Object.values(SYSTEM_PROMPT_NAMES)) {
      const local = getLocalSystemPrompt(name);
      for (const marker of REQUIRED_PROMPT_MARKERS[name]) {
        expect(local, `${name} must contain marker "${marker}"`).toContain(marker);
      }
    }
  });

  it("requires safety and JSON markers for structured prompts built from the fragments", () => {
    for (const name of [
      SYSTEM_PROMPT_NAMES.TEXT_QUERY,
      SYSTEM_PROMPT_NAMES.IMAGE_QUERY,
      SYSTEM_PROMPT_NAMES.VOICE_AUDIO_INTERPRET,
      SYSTEM_PROMPT_NAMES.MISSION_QUERY,
      SYSTEM_PROMPT_NAMES.REFINE_QUERY,
    ]) {
      expect(REQUIRED_PROMPT_MARKERS[name]).toHaveLength(2);
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

    const managed = managedPromptText(SYSTEM_PROMPT_NAMES.TEXT_QUERY, "From config-enabled Langfuse");
    const get = vi.fn().mockResolvedValue({ prompt: managed, isFallback: false });
    _setLangfusePromptClientFactoryForTests(() => ({ prompt: { get } }) as never);

    const resolved = await resolveSystemPrompt(SYSTEM_PROMPT_NAMES.TEXT_QUERY);
    expect(resolved.source).toBe("langfuse");
    expect(resolved.text).toBe(managed);
    expect(get).toHaveBeenCalledWith(SYSTEM_PROMPT_NAMES.TEXT_QUERY, {
      type: "text",
      label: "staging",
      fallback: getLocalSystemPrompt(SYSTEM_PROMPT_NAMES.TEXT_QUERY),
      cacheTtlSeconds: 30,
      fetchTimeoutMs: 2000,
      maxRetries: 0,
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
      fetchTimeoutMs: 2000,
      maxRetries: 0,
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

    const managed = managedPromptText(SYSTEM_PROMPT_NAMES.TEXT_QUERY, "Managed");
    const promptClient = { prompt: managed, isFallback: false };
    _setLangfusePromptClientFactoryForTests(() => ({
      prompt: {
        get: vi.fn().mockResolvedValue(promptClient),
      },
    }) as never);

    const text = await resolveAndLinkSystemPrompt(SYSTEM_PROMPT_NAMES.TEXT_QUERY);
    expect(text).toBe(managed);
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
  describe("bounded fetch", () => {
    const enable = () => {
      process.env.LANGFUSE_PUBLIC_KEY = "pk";
      process.env.LANGFUSE_SECRET_KEY = "sk";
      process.env.LANGFUSE_PROMPTS = "true";
    };

    afterEach(() => {
      vi.useRealTimers();
    });

    it("returns local prompt within timeout when Langfuse never resolves", async () => {
      vi.useFakeTimers();
      enable();
      const get = vi.fn().mockReturnValue(new Promise(() => undefined));
      _setLangfusePromptClientFactoryForTests(() => ({ prompt: { get } }) as never);

      let settled = false;
      const pending = resolveSystemPrompt(SYSTEM_PROMPT_NAMES.TEXT_QUERY).then((value) => {
        settled = true;
        return value;
      });

      await vi.advanceTimersByTimeAsync(1999);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      const resolved = await pending;

      expect(settled).toBe(true);
      expect(resolved.source).toBe("local");
      expect(resolved.text).toBe(getLocalSystemPrompt(SYSTEM_PROMPT_NAMES.TEXT_QUERY));
      expect(resolved.prompt).toBeUndefined();
    });

    it("ignores a late rejection of the abandoned SDK promise after the timeout won", async () => {
      vi.useFakeTimers();
      enable();
      const unhandled: unknown[] = [];
      const onUnhandled = (reason: unknown) => {
        unhandled.push(reason);
      };
      process.on("unhandledRejection", onUnhandled);
      try {
        let rejectLate: (error: Error) => void = () => undefined;
        const get = vi.fn().mockReturnValue(
          new Promise((_, reject) => {
            rejectLate = reject;
          }),
        );
        _setLangfusePromptClientFactoryForTests(() => ({ prompt: { get } }) as never);

        const pending = resolveSystemPrompt(SYSTEM_PROMPT_NAMES.TEXT_QUERY);
        await vi.advanceTimersByTimeAsync(2000);
        const resolved = await pending;
        expect(resolved.source).toBe("local");
        expect(resolved.text).toBe(getLocalSystemPrompt(SYSTEM_PROMPT_NAMES.TEXT_QUERY));

        rejectLate(new Error("late network failure"));
        vi.useRealTimers();
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(unhandled).toEqual([]);
      } finally {
        process.off("unhandledRejection", onUnhandled);
      }
    });

    it("honors configured promptFetchTimeoutMs and promptMaxRetries", async () => {
      vi.useFakeTimers();
      enable();
      configureLangfusePrompts({ promptsEnabled: true, promptFetchTimeoutMs: 500, promptMaxRetries: 1 });
      const get = vi.fn().mockReturnValue(new Promise(() => undefined));
      _setLangfusePromptClientFactoryForTests(() => ({ prompt: { get } }) as never);

      const pending = resolveSystemPrompt(SYSTEM_PROMPT_NAMES.TEXT_QUERY);
      await vi.advanceTimersByTimeAsync(500);
      const resolved = await pending;

      expect(resolved.source).toBe("local");
      expect(get).toHaveBeenCalledWith(
        SYSTEM_PROMPT_NAMES.TEXT_QUERY,
        expect.objectContaining({ fetchTimeoutMs: 500, maxRetries: 1 }),
      );
    });

    it("does not refetch within the negative-cache window", async () => {
      vi.useFakeTimers();
      enable();
      const get = vi.fn().mockRejectedValue(new Error("network"));
      _setLangfusePromptClientFactoryForTests(() => ({ prompt: { get } }) as never);

      await resolveSystemPrompt(SYSTEM_PROMPT_NAMES.TEXT_QUERY);
      await vi.advanceTimersByTimeAsync(29_999);
      const second = await resolveSystemPrompt(SYSTEM_PROMPT_NAMES.TEXT_QUERY);
      expect(second.source).toBe("local");
      expect(get).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1);
      await resolveSystemPrompt(SYSTEM_PROMPT_NAMES.TEXT_QUERY);
      expect(get).toHaveBeenCalledTimes(2);
    });

    it("keys the negative cache by prompt name", async () => {
      enable();
      const get = vi.fn().mockRejectedValue(new Error("network"));
      _setLangfusePromptClientFactoryForTests(() => ({ prompt: { get } }) as never);

      await resolveSystemPrompt(SYSTEM_PROMPT_NAMES.TEXT_QUERY);
      await resolveSystemPrompt(SYSTEM_PROMPT_NAMES.IMAGE_QUERY);
      expect(get).toHaveBeenCalledTimes(2);
    });

    it("negative-caches an SDK fallback result (failed fetch that did not throw)", async () => {
      enable();
      const local = getLocalSystemPrompt(SYSTEM_PROMPT_NAMES.TEXT_QUERY);
      const get = vi.fn().mockResolvedValue({ prompt: local, isFallback: true });
      _setLangfusePromptClientFactoryForTests(() => ({ prompt: { get } }) as never);

      await resolveSystemPrompt(SYSTEM_PROMPT_NAMES.TEXT_QUERY);
      await resolveSystemPrompt(SYSTEM_PROMPT_NAMES.TEXT_QUERY);
      expect(get).toHaveBeenCalledTimes(1);
    });

    it("does not cache successful fetches itself", async () => {
      enable();
      const text = managedPromptText(SYSTEM_PROMPT_NAMES.TEXT_QUERY, "ok");
      const get = vi.fn().mockResolvedValue({ prompt: text, isFallback: false });
      _setLangfusePromptClientFactoryForTests(() => ({ prompt: { get } }) as never);

      await resolveSystemPrompt(SYSTEM_PROMPT_NAMES.TEXT_QUERY);
      await resolveSystemPrompt(SYSTEM_PROMPT_NAMES.TEXT_QUERY);
      expect(get).toHaveBeenCalledTimes(2);
    });
  });

  describe("integrity check", () => {
    const enable = () => {
      process.env.LANGFUSE_PUBLIC_KEY = "pk";
      process.env.LANGFUSE_SECRET_KEY = "sk";
      process.env.LANGFUSE_PROMPTS = "true";
    };

    it("rejects a managed prompt without SAFETY_RULES marker", async () => {
      enable();
      const safetyMarker = REQUIRED_PROMPT_MARKERS[SYSTEM_PROMPT_NAMES.TEXT_QUERY][0] ?? "";
      const stripped = getLocalSystemPrompt(SYSTEM_PROMPT_NAMES.TEXT_QUERY).replace(safetyMarker, "");
      expect(safetyMarker).not.toBe("");
      expect(stripped).not.toContain(safetyMarker);
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      _setLangfusePromptClientFactoryForTests(
        () =>
          ({
            prompt: { get: vi.fn().mockResolvedValue({ prompt: stripped, isFallback: false, version: 7 }) },
          }) as never,
      );

      const resolved = await resolveSystemPrompt(SYSTEM_PROMPT_NAMES.TEXT_QUERY);
      expect(resolved.source).toBe("local");
      expect(resolved.text).toBe(getLocalSystemPrompt(SYSTEM_PROMPT_NAMES.TEXT_QUERY));
      expect(resolved.prompt).toBeUndefined();

      expect(warn).toHaveBeenCalledTimes(1);
      const logged = warn.mock.calls.flat().join(" ");
      expect(logged).toContain(SYSTEM_PROMPT_NAMES.TEXT_QUERY);
      expect(logged).toContain("7");
      expect(logged).not.toContain(stripped.slice(0, 40));
      warn.mockRestore();
    });

    it("rejection warning names the missing marker phrases but not the prompt text", async () => {
      enable();
      const secret = "UNIQUE-REMOTE-PROMPT-BODY-9f3a";
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      _setLangfusePromptClientFactoryForTests(
        () =>
          ({
            prompt: { get: vi.fn().mockResolvedValue({ prompt: `${secret} nothing else`, isFallback: false, version: 3 }) },
          }) as never,
      );

      await resolveSystemPrompt(SYSTEM_PROMPT_NAMES.TEXT_QUERY);

      expect(warn).toHaveBeenCalledTimes(1);
      const logged = warn.mock.calls.flat().join(" ");
      for (const marker of REQUIRED_PROMPT_MARKERS[SYSTEM_PROMPT_NAMES.TEXT_QUERY]) {
        expect(logged).toContain(`"${marker}"`);
      }
      expect(logged).not.toContain(secret);
      warn.mockRestore();
    });

    it("lists only the marker phrases that are missing", async () => {
      enable();
      const jsonMarker = REQUIRED_PROMPT_MARKERS[SYSTEM_PROMPT_NAMES.TEXT_QUERY][1] ?? "";
      const safetyMarker = REQUIRED_PROMPT_MARKERS[SYSTEM_PROMPT_NAMES.TEXT_QUERY][0] ?? "";
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      _setLangfusePromptClientFactoryForTests(
        () => ({ prompt: { get: vi.fn().mockResolvedValue({ prompt: jsonMarker, isFallback: false }) } }) as never,
      );

      await resolveSystemPrompt(SYSTEM_PROMPT_NAMES.TEXT_QUERY);

      const logged = warn.mock.calls.flat().join(" ");
      expect(logged).toContain(`"${safetyMarker}"`);
      expect(logged).not.toContain(`"${jsonMarker}"`);
      warn.mockRestore();
    });

    it("rejects a structured managed prompt without the JSON-only marker", async () => {
      enable();
      const jsonMarker = REQUIRED_PROMPT_MARKERS[SYSTEM_PROMPT_NAMES.MISSION_QUERY][1] ?? "";
      expect(jsonMarker).not.toBe("");
      const stripped = getLocalSystemPrompt(SYSTEM_PROMPT_NAMES.MISSION_QUERY).replace(jsonMarker, "");
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      _setLangfusePromptClientFactoryForTests(
        () => ({ prompt: { get: vi.fn().mockResolvedValue({ prompt: stripped, isFallback: false }) } }) as never,
      );

      const resolved = await resolveSystemPrompt(SYSTEM_PROMPT_NAMES.MISSION_QUERY);
      expect(resolved.source).toBe("local");
      warn.mockRestore();
    });

    it("accepts a managed prompt that contains its markers plus extra lines", async () => {
      enable();
      const text = `${getLocalSystemPrompt(SYSTEM_PROMPT_NAMES.TEXT_QUERY)}\nExtra line.`;
      _setLangfusePromptClientFactoryForTests(
        () => ({ prompt: { get: vi.fn().mockResolvedValue({ prompt: text, isFallback: false }) } }) as never,
      );
      const resolved = await resolveSystemPrompt(SYSTEM_PROMPT_NAMES.TEXT_QUERY);
      expect(resolved.source).toBe("langfuse");
      expect(resolved.text).toBe(text);
    });

    it("does not link a rejected managed prompt to the generation", async () => {
      enable();
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      _setLangfusePromptClientFactoryForTests(
        () =>
          ({
            prompt: { get: vi.fn().mockResolvedValue({ prompt: "no markers here", isFallback: false }) },
          }) as never,
      );

      const text = await resolveAndLinkSystemPrompt(SYSTEM_PROMPT_NAMES.TEXT_QUERY);
      expect(text).toBe(getLocalSystemPrompt(SYSTEM_PROMPT_NAMES.TEXT_QUERY));
      expect(updateActiveObservation).not.toHaveBeenCalled();
      warn.mockRestore();
    });
  });
});
