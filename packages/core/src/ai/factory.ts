import { BedrockProvider } from "./providers/bedrock.js";
import { OpenRouterProvider } from "./providers/openrouter.js";
import type { AIConfig } from "../types/index.js";
import type { AIProvider } from "./types.js";

export type { AIProvider } from "./types.js";

export function createAIProvider(config: AIConfig): AIProvider {
  if (config.provider === "openrouter") {
    if (!config.openrouter?.apiKey) {
      throw new Error("OpenRouter API key is required");
    }
    return new OpenRouterProvider(config.openrouter);
  }

  if (!config.bedrock?.region) {
    throw new Error("Bedrock region is required");
  }

  return new BedrockProvider(config.bedrock);
}
