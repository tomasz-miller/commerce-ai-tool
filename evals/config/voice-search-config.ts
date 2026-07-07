import { appendBedrockProvidersIfAvailable } from "./append-bedrock-providers.ts";
import { jsonShapeAssertions } from "./assertions.ts";

const OPENROUTER_BASELINE_TEXT = {
  id: "file://providers/voice-baseline-provider.ts",
  label: "baseline-text-gemini-31-lite",
  config: {
    provider: "openrouter",
    model: "google/gemini-3.1-flash-lite-preview",
    mode: "text-only",
  },
} as const;

const OPENROUTER_BASELINE_ENHANCE = {
  id: "file://providers/voice-baseline-provider.ts",
  label: "baseline-enhance-gemini-31-lite",
  config: {
    provider: "openrouter",
    model: "google/gemini-3.1-flash-lite-preview",
    mode: "enhance-then-interpret",
  },
} as const;

const BEDROCK_BASELINE_ENHANCE = {
  id: "file://providers/voice-baseline-provider.ts",
  label: "baseline-enhance-bedrock",
  config: {
    provider: "bedrock",
    model: "anthropic.claude-3-5-sonnet-20241022-v2:0",
    mode: "enhance-then-interpret",
  },
} as const;

const GEMINI_25_AUDIO = {
  id: "file://providers/voice-audio-provider.ts",
  label: "gemini-25-flash-audio",
  config: {
    voiceModel: "google/gemini-2.5-flash",
  },
} as const;

const GEMINI_31_AUDIO = {
  id: "file://providers/voice-audio-provider.ts",
  label: "gemini-31-flash-lite-audio",
  config: {
    voiceModel: "google/gemini-3.1-flash-lite-preview",
  },
} as const;

export default function voiceSearchConfig() {
  return {
    description: "Commerce AI — voice search evals (audio + baseline transcript providers)",
    prompts: ["{{transcript}}{{audioFile}}"],
    providers: [
      OPENROUTER_BASELINE_TEXT,
      OPENROUTER_BASELINE_ENHANCE,
      ...appendBedrockProvidersIfAvailable([], [BEDROCK_BASELINE_ENHANCE]),
      GEMINI_25_AUDIO,
      GEMINI_31_AUDIO,
    ],
    defaultTest: {
      assert: [...jsonShapeAssertions],
    },
    tests: ["file://tests/voice-search.yaml"],
  };
}
