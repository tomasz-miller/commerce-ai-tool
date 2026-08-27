import { appendBedrockProvidersIfAvailable } from "./append-bedrock-providers.ts";
import { jsonShapeAssertions } from "./assertions.ts";

const OPENROUTER_PROVIDER = {
  id: "file://providers/text-search-provider.ts",
  label: "openrouter-glm-53-flash",
  config: {
    provider: "openrouter",
    model: "z-ai/glm-5.3-flash",
  },
} as const;

const BEDROCK_PROVIDER = {
  id: "file://providers/text-search-provider.ts",
  label: "bedrock-claude-35-sonnet",
  config: {
    provider: "bedrock",
    model: "anthropic.claude-3-5-sonnet-20241022-v2:0",
  },
} as const;

export default function textSearchConfig() {
  return {
    description: "Commerce AI — text search interpretation evals",
    prompts: ["{{query}}"],
    providers: appendBedrockProvidersIfAvailable(
      [OPENROUTER_PROVIDER],
      [BEDROCK_PROVIDER],
    ),
    defaultTest: {
      assert: [...jsonShapeAssertions],
    },
    tests: ["file://tests/text-search.yaml"],
  };
}
