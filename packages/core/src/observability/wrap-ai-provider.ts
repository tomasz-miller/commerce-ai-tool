import { startActiveObservation } from "@langfuse/tracing";
import type { AIProviderName } from "../types/index.js";
import type { AICallMetrics, AICallOptions, AIProvider } from "../ai/types.js";
import { isLangfuseEnabled } from "./enabled.js";
import { redactBase64ImageInput, redactBinaryInput } from "./redact.js";

export interface AIProviderTraceMeta {
  provider: AIProviderName;
  textModel?: string;
  visionModel?: string;
  voiceModel?: string;
}

/**
 * Wrap an AIProvider so each method becomes a Langfuse generation observation.
 * Binary image/audio inputs are redacted. No-op when Langfuse is disabled.
 */
export function wrapAIProvider(provider: AIProvider, meta: AIProviderTraceMeta): AIProvider {
  if (!isLangfuseEnabled()) {
    return provider;
  }

  return {
    interpretTextQuery(text, locales, attributeCatalog = [], options) {
      return startActiveObservation(
        "ai.interpretTextQuery",
        async (generation) => {
          generation.update({
            model: meta.textModel,
            metadata: { provider: meta.provider },
            input: {
              text,
              locales,
              attributeCatalogSize: attributeCatalog.length,
            },
          });
          try {
            const result = await provider.interpretTextQuery(
              text,
              locales,
              attributeCatalog,
              withGenerationMetrics(generation, options),
            );
            generation.update({ output: result });
            return result;
          } catch (error) {
            markGenerationError(generation, error);
            throw error;
          }
        },
        { asType: "generation" },
      );
    },

    interpretRefineQuery(text, context, locales, options) {
      return startActiveObservation(
        "ai.interpretRefineQuery",
        async (generation) => {
          generation.update({
            model: meta.textModel,
            metadata: { provider: meta.provider },
            input: {
              text,
              locales,
              searchTerms: context.searchTerms,
              attributeCatalogSize: context.attributeCatalog.length,
            },
          });
          try {
            const result = await provider.interpretRefineQuery(
              text,
              context,
              locales,
              withGenerationMetrics(generation, options),
            );
            generation.update({ output: result });
            return result;
          } catch (error) {
            markGenerationError(generation, error);
            throw error;
          }
        },
        { asType: "generation" },
      );
    },

    interpretImageQuery(imageBase64, mimeType, locales, attributeCatalog = [], options) {
      return startActiveObservation(
        "ai.interpretImageQuery",
        async (generation) => {
          generation.update({
            model: meta.visionModel ?? meta.textModel,
            metadata: { provider: meta.provider, attributeCatalogSize: attributeCatalog.length },
            input: {
              locales,
              image: redactBase64ImageInput(mimeType, imageBase64),
            },
          });
          try {
            const result = await provider.interpretImageQuery(
              imageBase64,
              mimeType,
              locales,
              attributeCatalog,
              withGenerationMetrics(generation, options),
            );
            generation.update({ output: result });
            return result;
          } catch (error) {
            markGenerationError(generation, error);
            throw error;
          }
        },
        { asType: "generation" },
      );
    },

    interpretVoiceAudio(audio, mimeType, locales, attributeCatalog = [], options) {
      return startActiveObservation(
        "ai.interpretVoiceAudio",
        async (generation) => {
          generation.update({
            model: meta.voiceModel ?? meta.textModel,
            metadata: { provider: meta.provider, attributeCatalogSize: attributeCatalog.length },
            input: {
              locales,
              audio: redactBinaryInput(mimeType, audio),
            },
          });
          try {
            const result = await provider.interpretVoiceAudio(
              audio,
              mimeType,
              locales,
              attributeCatalog,
              withGenerationMetrics(generation, options),
            );
            generation.update({
              output: {
                transcript: result.transcript,
                enhancedQuery: result.enhancedQuery,
                searchTerms: result.searchTerms,
                interpretation: result.interpretation,
              },
            });
            return result;
          } catch (error) {
            markGenerationError(generation, error);
            throw error;
          }
        },
        { asType: "generation" },
      );
    },

    enhanceVoiceTranscript(transcript, locales, options) {
      return startActiveObservation(
        "ai.enhanceVoiceTranscript",
        async (generation) => {
          generation.update({
            model: meta.textModel,
            metadata: { provider: meta.provider },
            input: { transcript, locales },
          });
          try {
            const result = await provider.enhanceVoiceTranscript(
              transcript,
              locales,
              withGenerationMetrics(generation, options),
            );
            generation.update({ output: result });
            return result;
          } catch (error) {
            markGenerationError(generation, error);
            throw error;
          }
        },
        { asType: "generation" },
      );
    },

    suggestSearchTerms(query, locales, limit = 8, options) {
      return startActiveObservation(
        "ai.suggestSearchTerms",
        async (generation) => {
          generation.update({
            model: meta.textModel,
            metadata: { provider: meta.provider },
            input: { query, locales, limit },
          });
          try {
            const result = await provider.suggestSearchTerms(
              query,
              locales,
              limit,
              withGenerationMetrics(generation, options),
            );
            generation.update({ output: result });
            return result;
          } catch (error) {
            markGenerationError(generation, error);
            throw error;
          }
        },
        { asType: "generation" },
      );
    },

    summarizeVoiceResults(count, topProductName, locales, options) {
      return startActiveObservation(
        "ai.summarizeVoiceResults",
        async (generation) => {
          generation.update({
            model: meta.textModel,
            metadata: { provider: meta.provider },
            input: { count, topProductName, locales },
          });
          try {
            const result = await provider.summarizeVoiceResults(
              count,
              topProductName,
              locales,
              withGenerationMetrics(generation, options),
            );
            generation.update({ output: result });
            return result;
          } catch (error) {
            markGenerationError(generation, error);
            throw error;
          }
        },
        { asType: "generation" },
      );
    },

    decomposeShoppingMission(text, locales, attributeCatalog = [], options) {
      return startActiveObservation(
        "ai.decomposeShoppingMission",
        async (generation) => {
          generation.update({
            model: meta.textModel,
            metadata: { provider: meta.provider },
            input: {
              text,
              locales,
              attributeCatalogSize: attributeCatalog.length,
            },
          });
          try {
            const result = await provider.decomposeShoppingMission(
              text,
              locales,
              attributeCatalog,
              withGenerationMetrics(generation, options),
            );
            generation.update({ output: result });
            return result;
          } catch (error) {
            markGenerationError(generation, error);
            throw error;
          }
        },
        { asType: "generation" },
      );
    },

    // Optional method: only exposed when the wrapped provider implements it, so the orchestrator's
    // enhance-then-interpret fallback still applies to custom providers.
    ...(provider.interpretVoiceTranscript
      ? {
          interpretVoiceTranscript(
            transcript: string,
            locales: Parameters<NonNullable<AIProvider["interpretVoiceTranscript"]>>[1],
            attributeCatalog: NonNullable<Parameters<NonNullable<AIProvider["interpretVoiceTranscript"]>>[2]> = [],
            options?: AICallOptions,
          ) {
            return startActiveObservation(
              "ai.interpretVoiceTranscript",
              async (generation) => {
                generation.update({
                  model: meta.textModel,
                  metadata: { provider: meta.provider },
                  input: {
                    transcript,
                    locales,
                    attributeCatalogSize: attributeCatalog.length,
                  },
                });
                try {
                  const result = await provider.interpretVoiceTranscript!(
                    transcript,
                    locales,
                    attributeCatalog,
                    withGenerationMetrics(generation, options),
                  );
                  generation.update({ output: result });
                  return result;
                } catch (error) {
                  markGenerationError(generation, error);
                  throw error;
                }
              },
              { asType: "generation" },
            );
          },
        }
      : {}),
  };
}

type GenerationHandle = {
  update: (attrs: {
    model?: string;
    usageDetails?: Record<string, number>;
    costDetails?: Record<string, number>;
  }) => unknown;
};

/**
 * Per-call options whose `onMetrics` writes this call's model, usage and cost to its own
 * generation (and still forwards to the caller's callback). No state is shared between calls.
 */
function withGenerationMetrics(
  generation: GenerationHandle,
  options: AICallOptions | undefined,
): AICallOptions {
  return {
    ...options,
    onMetrics: (metrics) => {
      applyGenerationMetrics(generation, metrics);
      options?.onMetrics?.(metrics);
    },
  };
}

function applyGenerationMetrics(generation: GenerationHandle, metrics: AICallMetrics): void {
  const { usage, costUsd } = metrics;
  generation.update({
    model: metrics.model,
    ...(usage
      ? {
          usageDetails: {
            input: usage.input,
            output: usage.output,
            total: usage.total,
            ...(usage.cacheRead ? { cache_read_input_tokens: usage.cacheRead } : {}),
          },
        }
      : {}),
    costDetails: costUsd !== undefined ? { total: costUsd } : undefined,
  });
}

function markGenerationError(
  generation: { update: (attrs: { level?: "ERROR"; statusMessage?: string }) => unknown },
  error: unknown,
): void {
  generation.update({
    level: "ERROR",
    statusMessage: error instanceof Error ? error.message : "unknown error",
  });
}
