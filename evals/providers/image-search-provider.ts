import type { CallApiContextParams, ProviderOptions, ProviderResponse } from "promptfoo";
import {
  DEFAULT_CATALOG_LOCALE,
  createEvalAIProvider,
  createSkippedProviderResponse,
  loadEvalEnvFile,
  readImageFixture,
  readProviderConfig,
} from "./eval-utils.ts";

loadEvalEnvFile();

export default class ImageSearchEvalProvider {
  private readonly providerId: string;
  private readonly evalProvider;

  constructor(options: ProviderOptions) {
    this.providerId = options.id ?? "commerce-image-search";
    this.evalProvider = createEvalAIProvider(readProviderConfig(options));
  }

  id(): string {
    return this.providerId;
  }

  async callApi(_prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    if (this.evalProvider.skipped) {
      return createSkippedProviderResponse(this.evalProvider.skipReason ?? "Provider unavailable");
    }

    const vars = context?.vars ?? {};
    const imageFile = String(vars.imageFile ?? "");
    const catalogLocale = String(vars.catalogLocale ?? DEFAULT_CATALOG_LOCALE);
    const queryLocale = String(vars.queryLocale ?? catalogLocale);

    if (!imageFile) {
      return { error: "Missing test variable: imageFile" };
    }

    try {
      const { base64, mimeType } = readImageFixture(imageFile);
      const result = await this.evalProvider.ai!.interpretImageQuery(base64, mimeType, {
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
