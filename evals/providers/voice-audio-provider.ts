import { createAIProvider } from "@commerce-ai-tool/core";
import type { AIProvider } from "@commerce-ai-tool/core";
import type { CallApiContextParams, ProviderOptions, ProviderResponse } from "promptfoo";
import {
  DEFAULT_CATALOG_LOCALE,
  createOpenRouterProviderOptions,
  loadEvalEnvFile,
  readAudioFixture,
} from "./eval-utils.ts";

loadEvalEnvFile();

export default class VoiceAudioEvalProvider {
  private readonly providerId: string;
  private readonly ai: AIProvider;

  constructor(options: ProviderOptions) {
    const config = options.config ?? {};
    this.providerId = options.id ?? "commerce-voice-audio";
    this.ai = createAIProvider({
      provider: "openrouter",
      openrouter: createOpenRouterProviderOptions({
        voiceModel: typeof config.voiceModel === "string" ? config.voiceModel : undefined,
        model: typeof config.model === "string" ? config.model : undefined,
      }),
    });
  }

  id(): string {
    return this.providerId;
  }

  async callApi(_prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    const vars = context?.vars ?? {};
    const audioFile = String(vars.audioFile ?? "");
    const catalogLocale = String(vars.catalogLocale ?? DEFAULT_CATALOG_LOCALE);
    const queryLocale = String(vars.queryLocale ?? catalogLocale);

    if (!audioFile) {
      return { error: "Missing test variable: audioFile" };
    }

    try {
      const { bytes, mimeType } = readAudioFixture(audioFile);
      const result = await this.ai.interpretVoiceAudio(bytes, mimeType, {
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
