import { createAIProvider } from "@commerce-ai-tool/core";
import type { AIProvider } from "@commerce-ai-tool/core";
import type { CallApiContextParams, ProviderOptions, ProviderResponse } from "promptfoo";
import {
  DEFAULT_CATALOG_LOCALE,
  createOpenRouterProviderOptions,
  loadEvalEnvFile,
  readImageFixture,
} from "./eval-utils.ts";

loadEvalEnvFile();

export default class ImageSearchEvalProvider {
  private readonly providerId: string;
  private readonly ai: AIProvider;

  constructor(options: ProviderOptions) {
    const config = options.config ?? {};
    this.providerId = options.id ?? "commerce-image-search";
    this.ai = createAIProvider({
      provider: "openrouter",
      openrouter: createOpenRouterProviderOptions({
        visionModel:
          typeof config.visionModel === "string" ? config.visionModel : undefined,
        model: typeof config.model === "string" ? config.model : undefined,
      }),
    });
  }

  id(): string {
    return this.providerId;
  }

  async callApi(_prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    const vars = context?.vars ?? {};
    const imageFile = String(vars.imageFile ?? "");
    const catalogLocale = String(vars.catalogLocale ?? DEFAULT_CATALOG_LOCALE);
    const queryLocale = String(vars.queryLocale ?? catalogLocale);

    if (!imageFile) {
      return { error: "Missing test variable: imageFile" };
    }

    try {
      const { bytes, mimeType } = readImageFixture(imageFile);
      const base64 = Buffer.from(bytes).toString("base64");
      const result = await this.ai.interpretImageQuery(base64, mimeType, {
        queryLocale,
        catalogLocale,
      });

      return {
        output: JSON.stringify(result, null, 2),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { error: message };
    }
  }
}
