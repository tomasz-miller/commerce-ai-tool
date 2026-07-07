import type { CallApiContextParams, ProviderOptions, ProviderResponse } from "promptfoo";
import {
  DEFAULT_CATALOG_LOCALE,
  createEvalAIProvider,
  createSkippedProviderResponse,
  loadEvalEnvFile,
  readProviderConfig,
} from "./eval-utils.ts";

loadEvalEnvFile();

export default class VoiceEnhanceEvalProvider {
  private readonly providerId: string;
  private readonly evalProvider;

  constructor(options: ProviderOptions) {
    this.providerId = options.id ?? "commerce-voice-enhance";
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
    const transcript = String(vars.transcript ?? "");
    const catalogLocale = String(vars.catalogLocale ?? DEFAULT_CATALOG_LOCALE);
    const queryLocale = String(vars.queryLocale ?? catalogLocale);

    if (!transcript) {
      return { error: "Missing test variable: transcript" };
    }

    try {
      const enhanced = await this.evalProvider.ai!.enhanceVoiceTranscript(transcript, {
        queryLocale,
        catalogLocale,
      });

      return { output: enhanced };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { error: message };
    }
  }
}
