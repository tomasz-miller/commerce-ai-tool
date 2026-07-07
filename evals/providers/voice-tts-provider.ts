import type { CallApiContextParams, ProviderOptions, ProviderResponse } from "promptfoo";
import {
  DEFAULT_CATALOG_LOCALE,
  createEvalAIProvider,
  createSkippedProviderResponse,
  loadEvalEnvFile,
  readProviderConfig,
} from "./eval-utils.ts";

loadEvalEnvFile();

export default class VoiceTtsEvalProvider {
  private readonly providerId: string;
  private readonly evalProvider;

  constructor(options: ProviderOptions) {
    this.providerId = options.id ?? "commerce-voice-tts";
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
    const rawCount = vars.resultCount ?? vars.count;
    const resultCount = Number(rawCount ?? 0);
    const topProductName =
      vars.topProductName === undefined || vars.topProductName === null || vars.topProductName === ""
        ? undefined
        : String(vars.topProductName);
    const catalogLocale = String(vars.catalogLocale ?? DEFAULT_CATALOG_LOCALE);
    const queryLocale = String(vars.queryLocale ?? catalogLocale);

    if (rawCount === undefined || rawCount === null || rawCount === "" || Number.isNaN(resultCount)) {
      return { error: "Missing or invalid test variable: resultCount" };
    }

    try {
      const summary = await this.evalProvider.ai!.summarizeVoiceResults(resultCount, topProductName, {
        queryLocale,
        catalogLocale,
      });

      return { output: summary };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { error: message };
    }
  }
}
