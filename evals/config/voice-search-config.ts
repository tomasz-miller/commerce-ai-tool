import { appendBedrockProvidersIfAvailable } from "./append-bedrock-providers.ts";
import { jsonShapeAssertions } from "./assertions.ts";

const OPENROUTER_BASELINE_TEXT = {
  id: "file://providers/voice-baseline-provider.ts",
  label: "baseline-text-glm-53-flash",
  config: {
    provider: "openrouter",
    model: "z-ai/glm-5.3-flash",
    mode: "text-only",
  },
} as const;

const OPENROUTER_BASELINE_ENHANCE = {
  id: "file://providers/voice-baseline-provider.ts",
  label: "baseline-enhance-glm-53-flash",
  config: {
    provider: "openrouter",
    model: "z-ai/glm-5.3-flash",
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

const GEMINI_37_AUDIO = {
  id: "file://providers/voice-audio-provider.ts",
  label: "gemini-37-flash-audio",
  config: {
    voiceModel: "google/gemini-3.7-flash",
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
      GEMINI_37_AUDIO,
    ],
    defaultTest: {
      assert: [...jsonShapeAssertions],
    },
    tests: ["file://tests/voice-search.yaml"],
  };
}
