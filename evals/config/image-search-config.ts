import { appendBedrockProvidersIfAvailable } from "./append-bedrock-providers.ts";
import { jsonShapeAssertions } from "./assertions.ts";

const OPENROUTER_PROVIDER = {
  id: "file://providers/image-search-provider.ts",
  label: "openrouter-glm-53-flash",
  config: {
    provider: "openrouter",
    model: "z-ai/glm-5.3-flash",
    visionModel: "z-ai/glm-5.3-flash",
  },
} as const;

const BEDROCK_PROVIDER = {
  id: "file://providers/image-search-provider.ts",
  label: "bedrock-claude-35-sonnet",
  config: {
    provider: "bedrock",
    model: "anthropic.claude-3-5-sonnet-20241022-v2:0",
    visionModel: "anthropic.claude-3-5-sonnet-20241022-v2:0",
  },
} as const;

export default function imageSearchConfig() {
  return {
    description: "Commerce AI — image search interpretation evals",
    prompts: ["{{imageFile}}"],
    providers: appendBedrockProvidersIfAvailable(
      [OPENROUTER_PROVIDER],
      [BEDROCK_PROVIDER],
    ),
    defaultTest: {
      assert: [...jsonShapeAssertions],
    },
    tests: ["file://tests/image-search.yaml"],
  };
}
