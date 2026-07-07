import { isBedrockAvailable, loadEvalEnvFile } from "../providers/eval-utils.ts";

export interface PromptfooProviderConfig {
  id: string;
  label: string;
  config: Record<string, unknown>;
}

/**
 * Returns OpenRouter (or other base) providers, appending Bedrock columns only when
 * `AWS_REGION` is configured. Bedrock eval cells are omitted entirely when unavailable.
 */
export function appendBedrockProvidersIfAvailable<T extends PromptfooProviderConfig>(
  baseProviders: readonly T[],
  bedrockProviders: readonly T[],
): T[] {
  loadEvalEnvFile();
  if (!isBedrockAvailable()) {
    return [...baseProviders];
  }
  return [...baseProviders, ...bedrockProviders];
}
