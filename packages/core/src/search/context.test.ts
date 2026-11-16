import { describe, expect, it } from "vitest";
import type { CommerceAIConfig } from "../types/index.js";
import { resolveVoiceMode } from "./context.js";

function config(overrides: Partial<CommerceAIConfig> = {}): CommerceAIConfig {
  return {
    commercetools: { projectKey: "p", clientId: "c", clientSecret: "s", region: "eu" },
    ai: { provider: "openrouter", openrouter: { apiKey: "k" } },
    ...overrides,
  };
}

describe("resolveVoiceMode", () => {
  it("honours an explicit voiceMode", () => {
    expect(resolveVoiceMode(config({ voiceMode: "elevenlabs-stt" }))).toBe("elevenlabs-stt");
  });

  it("defaults to OpenRouter audio on the openrouter provider", () => {
    expect(resolveVoiceMode(config())).toBe("openrouter-audio");
  });

  it("defaults to ElevenLabs STT on other providers", () => {
    expect(resolveVoiceMode(config({ ai: { provider: "bedrock" } }))).toBe("elevenlabs-stt");
  });
});
