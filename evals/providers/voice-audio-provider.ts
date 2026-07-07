import type { CallApiContextParams, ProviderOptions, ProviderResponse } from "promptfoo";
import {
  DEFAULT_CATALOG_LOCALE,
  createEvalAIProvider,
  createSkippedProviderResponse,
  loadEvalEnvFile,
  readAudioFixture,
  readProviderConfig,
} from "./eval-utils.ts";

loadEvalEnvFile();

export default class VoiceAudioEvalProvider {
  private readonly providerId: string;
  private readonly evalProvider;

  constructor(options: ProviderOptions) {
    const config = options.config ?? {};
    this.providerId = options.id ?? "commerce-voice-audio";
    this.evalProvider = createEvalAIProvider(
      readProviderConfig({
        config: {
          ...config,
          provider: "openrouter",
        },
      }),
    );
  }

  id(): string {
    return this.providerId;
  }

  async callApi(_prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    if (this.evalProvider.skipped) {
      return createSkippedProviderResponse(this.evalProvider.skipReason ?? "Provider unavailable");
    }

    const vars = context?.vars ?? {};
    const audioFile = String(vars.audioFile ?? "");
    const catalogLocale = String(vars.catalogLocale ?? DEFAULT_CATALOG_LOCALE);
    const queryLocale = String(vars.queryLocale ?? catalogLocale);

    if (!audioFile) {
      return { error: "Missing test variable: audioFile" };
    }

    try {
      const { bytes, mimeType } = readAudioFixture(audioFile);
      const result = await this.evalProvider.ai!.interpretVoiceAudio(bytes, mimeType, {
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
