import { createAIProvider } from "@commerce-ai-tool/core";
import type { AIProvider } from "@commerce-ai-tool/core";
import type { CallApiContextParams, ProviderOptions, ProviderResponse } from "promptfoo";
import {
  DEFAULT_CATALOG_LOCALE,
  createOpenRouterProviderOptions,
  loadEvalEnvFile,
} from "./eval-utils.ts";

loadEvalEnvFile();

export default class VoiceBaselineEvalProvider {
  private readonly providerId: string;
  private readonly ai: AIProvider;
  private readonly mode: "text-only" | "enhance-then-interpret";

  constructor(options: ProviderOptions) {
    const config = options.config ?? {};
    this.providerId = options.id ?? "commerce-voice-baseline";
    this.mode =
      config.mode === "enhance-then-interpret" ? "enhance-then-interpret" : "text-only";

    this.ai = createAIProvider({
      provider: "openrouter",
      openrouter: createOpenRouterProviderOptions({
        model: typeof config.model === "string" ? config.model : undefined,
      }),
    });
  }

  id(): string {
    return this.providerId;
  }

  async callApi(_prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    const vars = context?.vars ?? {};
    const transcript = String(vars.transcript ?? "");
    const catalogLocale = String(vars.catalogLocale ?? DEFAULT_CATALOG_LOCALE);
    const queryLocale = String(vars.queryLocale ?? catalogLocale);

    if (!transcript) {
      return { error: "Missing test variable: transcript" };
    }

    try {
      const locales = { queryLocale, catalogLocale };
      const enhancedQuery =
        this.mode === "enhance-then-interpret"
          ? await this.ai.enhanceVoiceTranscript(transcript, locales)
          : transcript.trim();
      const interpreted = await this.ai.interpretTextQuery(enhancedQuery, locales);

      return {
        output: JSON.stringify(
          {
            transcript,
            enhancedQuery,
            ...interpreted,
          },
          null,
          2,
        ),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { error: message };
    }
  }
}
