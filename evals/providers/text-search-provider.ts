import type { CallApiContextParams, ProviderOptions, ProviderResponse } from "promptfoo";
import {
  DEFAULT_CATALOG_LOCALE,
  createEvalAIProvider,
  createSkippedProviderResponse,
  loadEvalEnvFile,
  readProviderConfig,
} from "./eval-utils.ts";

loadEvalEnvFile();

export default class TextSearchEvalProvider {
  private readonly providerId: string;
  private readonly evalProvider;

  constructor(options: ProviderOptions) {
    this.providerId = options.id ?? "commerce-text-search";
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
    const query = String(vars.query ?? "");
    const catalogLocale = String(vars.catalogLocale ?? DEFAULT_CATALOG_LOCALE);
    const queryLocale = String(vars.queryLocale ?? catalogLocale);

    if (!query) {
      return { error: "Missing test variable: query" };
    }

    try {
      const result = await this.evalProvider.ai!.interpretTextQuery(query, {
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
