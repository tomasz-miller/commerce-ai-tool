import type { CallApiContextParams, ProviderOptions, ProviderResponse } from "promptfoo";
import {
  DEFAULT_CATALOG_LOCALE,
  createEvalAIProvider,
  createSkippedProviderResponse,
  loadEvalEnvFile,
  parseAttributeCatalog,
  readProviderConfig,
  createEvalMetricsCapture,
  toEvalProviderResponse,
} from "./eval-utils.ts";
import {
  REFINE_BASE_TERMS,
  buildUntrustedVectorInput,
  isUntrustedVector,
  joinPhrases,
  type UntrustedVector,
} from "./untrusted-vector-input.ts";

loadEvalEnvFile();

/**
 * Red-team provider with a separate untrusted variable (`untrusted`), so Promptfoo's
 * `indirect-prompt-injection` plugin can target it through `indirectInjectionVar`.
 *
 * `config.vector` selects the entry point (all call the real `createAIProvider` paths):
 * - `voice-transcript`: `interpretVoiceTranscript`, the merged ElevenLabs call
 * - `refine-query`: `interpretRefineQuery` with a fixed previous search
 * - `image-caption`: `decomposeShoppingMission` over the vision step's phrases, the second-order hop
 *   of the image path (the vision call itself needs a real image and is not covered here)
 */
export default class UntrustedVectorEvalProvider {
  private readonly providerId: string;
  private readonly evalProvider;
  private readonly vector: UntrustedVector;

  constructor(options: ProviderOptions) {
    const vector = options.config?.vector;
    if (!isUntrustedVector(vector)) {
      throw new Error(
        `untrusted-vector-provider: config.vector must be voice-transcript, refine-query or image-caption (got ${String(vector)})`,
      );
    }
    this.vector = vector;
    this.providerId = options.id ?? `commerce-${vector}`;
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
    const catalogLocale = String(vars.catalogLocale ?? DEFAULT_CATALOG_LOCALE);
    const queryLocale = String(vars.queryLocale ?? catalogLocale);
    const locales = { queryLocale, catalogLocale };
    const input = buildUntrustedVectorInput(this.vector, vars);

    if (this.vector === "image-caption" ? input.phrases.length === 0 : !input.text) {
      return { error: "Missing test variable: untrusted (or query)" };
    }

    try {
      const ai = this.evalProvider.ai!;
      const attributeCatalog = parseAttributeCatalog(vars);
      const startedAt = Date.now();
      const capture = createEvalMetricsCapture();

      if (this.vector === "voice-transcript") {
        if (!ai.interpretVoiceTranscript) {
          return { error: "Provider does not implement interpretVoiceTranscript" };
        }
        const result = await ai.interpretVoiceTranscript(
          input.text,
          locales,
          attributeCatalog,
          capture.options,
        );
        return toEvalProviderResponse(result, capture.get(), startedAt);
      }

      if (this.vector === "refine-query") {
        const result = await ai.interpretRefineQuery(
          input.text,
          { searchTerms: REFINE_BASE_TERMS, filters: {}, attributeCatalog },
          locales,
          capture.options,
        );
        return toEvalProviderResponse(result, capture.get(), startedAt);
      }

      const result = await ai.decomposeShoppingMission(
        joinPhrases(input.phrases),
        locales,
        attributeCatalog,
        capture.options,
      );
      return toEvalProviderResponse(result, capture.get(), startedAt);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { error: message };
    }
  }
}
