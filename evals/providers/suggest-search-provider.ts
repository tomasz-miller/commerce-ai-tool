import type { CallApiContextParams, ProviderOptions, ProviderResponse } from "promptfoo";
import {
  DEFAULT_CATALOG_LOCALE,
  createEvalAIProvider,
  createSkippedProviderResponse,
  loadEvalEnvFile,
  readProviderConfig,
  toEvalProviderResponse,
} from "./eval-utils.ts";

loadEvalEnvFile();

export default class SuggestSearchEvalProvider {
  private readonly providerId: string;
  private readonly evalProvider;

  constructor(options: ProviderOptions) {
    this.providerId = options.id ?? "commerce-suggest-search";
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
    const limit = Number(vars.limit ?? 8);

    if (!query) {
      return { error: "Missing test variable: query" };
    }

    try {
      const startedAt = Date.now();
      const suggestions = await this.evalProvider.ai!.suggestSearchTerms(
        query,
        { queryLocale, catalogLocale },
        Number.isFinite(limit) ? limit : 8,
      );

      return toEvalProviderResponse({ suggestions }, this.evalProvider.ai!, startedAt);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { error: message };
    }
  }
}
