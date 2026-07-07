import { afterEach, describe, expect, it } from "vitest";
import {
  SKIPPED_OUTPUT_PREFIX,
  createEvalAIProvider,
  createSkippedProviderResponse,
  isBedrockAvailable,
  isSkippedEvalOutput,
  loadEvalEnvFile,
  readImageFixture,
  readProviderConfig,
} from "./eval-utils.ts";

describe("readImageFixture", () => {
  it("reads compressed red-shoes fixture with jpeg mime type", () => {
    const { bytes, mimeType } = readImageFixture("red-shoes.jpeg");
    expect(mimeType).toBe("image/jpeg");
    expect(bytes.length).toBeGreaterThan(100);
  });

  it("throws when image fixture is missing", () => {
    expect(() => readImageFixture("missing-image.jpeg")).toThrow(/Missing image fixture/);
  });
});

describe("createEvalAIProvider", () => {
  const envSnapshot = { ...process.env };

  afterEach(() => {
    process.env = { ...envSnapshot };
  });

  it("creates OpenRouter provider when API key is set", () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    const result = createEvalAIProvider({ provider: "openrouter" });
    expect(result.skipped).toBe(false);
    expect(result.ai).not.toBeNull();
  });

  it("throws when OpenRouter key is missing and skip is disabled", () => {
    delete process.env.OPENROUTER_API_KEY;
    expect(() => createEvalAIProvider({ provider: "openrouter" })).toThrow(
      /OPENROUTER_API_KEY is required/,
    );
  });

  it("skips OpenRouter provider when key is missing and skipIfUnavailable is true", () => {
    delete process.env.OPENROUTER_API_KEY;
    const result = createEvalAIProvider({
      provider: "openrouter",
      skipIfUnavailable: true,
    });
    expect(result.skipped).toBe(true);
    expect(result.ai).toBeNull();
    expect(result.skipReason).toContain("OPENROUTER_API_KEY");
  });

  it("skips Bedrock provider when AWS_REGION is missing and skipIfUnavailable is true", () => {
    delete process.env.AWS_REGION;
    const result = createEvalAIProvider({
      provider: "bedrock",
      skipIfUnavailable: true,
    });
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toContain("AWS_REGION");
  });

  it("creates Bedrock provider when AWS_REGION is set", () => {
    process.env.AWS_REGION = "eu-west-1";
    const result = createEvalAIProvider({ provider: "bedrock" });
    expect(result.skipped).toBe(false);
    expect(result.ai).not.toBeNull();
  });
});

describe("isBedrockAvailable", () => {
  const envSnapshot = { ...process.env };

  afterEach(() => {
    process.env = { ...envSnapshot };
  });

  it("returns false when AWS_REGION is unset", () => {
    delete process.env.AWS_REGION;
    expect(isBedrockAvailable()).toBe(false);
  });

  it("returns true when AWS_REGION is set", () => {
    process.env.AWS_REGION = "eu-west-1";
    expect(isBedrockAvailable()).toBe(true);
  });
});

describe("skip helpers", () => {
  it("marks skipped provider responses", () => {
    const response = createSkippedProviderResponse("AWS_REGION not configured");
    expect(response.output).toContain(SKIPPED_OUTPUT_PREFIX);
    expect(isSkippedEvalOutput(String(response.output))).toBe(true);
  });
});

describe("readProviderConfig", () => {
  it("maps promptfoo provider config fields", () => {
    expect(
      readProviderConfig({
        config: {
          provider: "bedrock",
          model: "anthropic.claude-3-5-sonnet-20241022-v2:0",
          visionModel: "vision-model",
          voiceModel: "voice-model",
          skipIfUnavailable: true,
        },
      }),
    ).toEqual({
      provider: "bedrock",
      model: "anthropic.claude-3-5-sonnet-20241022-v2:0",
      visionModel: "vision-model",
      voiceModel: "voice-model",
      skipIfUnavailable: true,
    });
  });
});

describe("loadEvalEnvFile", () => {
  it("does not throw when called", () => {
    expect(() => loadEvalEnvFile()).not.toThrow();
  });
});
