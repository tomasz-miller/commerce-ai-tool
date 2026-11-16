import { afterEach, describe, expect, it, vi } from "vitest";
import type { AICallMetrics } from "../types.js";
import { DEFAULT_BEDROCK_MODEL, DEFAULT_OPENROUTER_MODEL } from "../defaults.js";

const sdkSend = vi.fn();
const bedrockSend = vi.fn();

vi.mock("@openrouter/sdk", () => ({
  OpenRouter: class {
    chat = { send: sdkSend };
  },
}));

vi.mock("@aws-sdk/client-bedrock-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aws-sdk/client-bedrock-runtime")>();
  return {
    ...actual,
    BedrockRuntimeClient: class {
      send = bedrockSend;
    },
  };
});

const { OpenRouterProvider } = await import("./openrouter.js");
const { BedrockProvider } = await import("./bedrock.js");

const locales = { queryLocale: "en", catalogLocale: "en" };
const queryJson = JSON.stringify({ searchTerms: ["shoes"], interpretation: "shoes" });

afterEach(() => {
  vi.restoreAllMocks();
  sdkSend.mockReset();
  bedrockSend.mockReset();
});

describe("OpenRouterProvider onMetrics", () => {
  it("reports the response model, usage, cached tokens and finish reason", async () => {
    sdkSend.mockResolvedValue({
      model: "served/by-fallback",
      choices: [{ finishReason: "stop", message: { content: queryJson } }],
      usage: {
        promptTokens: 20,
        completionTokens: 5,
        totalTokens: 25,
        promptTokensDetails: { cachedTokens: 8 },
      },
    });
    const provider = new OpenRouterProvider({ apiKey: "k" });
    const seen: AICallMetrics[] = [];

    await provider.interpretTextQuery("shoes", locales, [], { onMetrics: (m) => seen.push(m) });

    expect(seen).toEqual([
      {
        model: "served/by-fallback",
        usage: { input: 20, output: 5, total: 25, cacheRead: 8 },
        finishReason: "stop",
      },
    ]);
  });

  it("falls back to the requested model when the response has none; cost stays undefined", async () => {
    sdkSend.mockResolvedValue({
      choices: [{ finishReason: "stop", message: { content: queryJson } }],
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    });
    const provider = new OpenRouterProvider({ apiKey: "k" });
    const seen: AICallMetrics[] = [];

    await provider.interpretTextQuery("shoes", locales, [], { onMetrics: (m) => seen.push(m) });

    expect(seen[0]?.model).toBe(DEFAULT_OPENROUTER_MODEL);
    expect(seen[0]?.costUsd).toBeUndefined();
  });

  it("reports usage.cost from the SDK 1.x response and uses the voice model for audio", async () => {
    sdkSend.mockResolvedValue({
      model: "google/gemini-served",
      choices: [
        {
          finishReason: "stop",
          message: {
            content: JSON.stringify({
              transcript: "hi",
              enhancedQuery: "hi",
              searchTerms: ["hi"],
              interpretation: "hi",
            }),
          },
        },
      ],
      usage: {
        promptTokens: 40,
        completionTokens: 10,
        totalTokens: 50,
        cost: 0.0042,
        promptTokensDetails: { cachedTokens: 12 },
      },
    });
    const provider = new OpenRouterProvider({ apiKey: "k" });
    const seen: AICallMetrics[] = [];

    await provider.interpretVoiceAudio(new Uint8Array([1, 2]), "audio/wav", locales, [], {
      onMetrics: (m) => seen.push(m),
    });

    expect(seen).toEqual([
      {
        model: "google/gemini-served",
        usage: { input: 40, output: 10, total: 50, cacheRead: 12 },
        costUsd: 0.0042,
        finishReason: "stop",
      },
    ]);
  });

  it("does not require an options argument", async () => {
    sdkSend.mockResolvedValue({ choices: [{ message: { content: queryJson } }] });
    const provider = new OpenRouterProvider({ apiKey: "k" });

    await expect(provider.interpretTextQuery("shoes", locales)).resolves.toBeDefined();
  });
});

describe("BedrockProvider onMetrics", () => {
  it("reports configured model id, Converse usage and stop reason", async () => {
    bedrockSend.mockResolvedValue({
      output: { message: { content: [{ text: queryJson }] } },
      stopReason: "end_turn",
      usage: { inputTokens: 30, outputTokens: 6, totalTokens: 36, cacheReadInputTokens: 4 },
    });
    const provider = new BedrockProvider({ region: "eu-west-1", modelId: "custom.model" });
    const seen: AICallMetrics[] = [];

    await provider.interpretTextQuery("shoes", locales, [], { onMetrics: (m) => seen.push(m) });

    expect(seen).toEqual([
      {
        model: "custom.model",
        usage: { input: 30, output: 6, total: 36, cacheRead: 4 },
        finishReason: "end_turn",
      },
    ]);
  });

  it("uses the default model id when none is configured", async () => {
    bedrockSend.mockResolvedValue({
      output: { message: { content: [{ text: queryJson }] } },
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    });
    const provider = new BedrockProvider({ region: "eu-west-1" });
    const seen: AICallMetrics[] = [];

    await provider.interpretTextQuery("shoes", locales, [], { onMetrics: (m) => seen.push(m) });

    expect(seen[0]?.model).toBe(DEFAULT_BEDROCK_MODEL);
  });
});
