import { startActiveObservation } from "@langfuse/tracing";
import type { AIProviderName } from "../types/index.js";
import type { AIProvider } from "../ai/types.js";
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
    interpretTextQuery(text, locales, attributeCatalog = []) {
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
            const result = await provider.interpretTextQuery(text, locales, attributeCatalog);
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

    interpretRefineQuery(text, context, locales) {
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
            const result = await provider.interpretRefineQuery(text, context, locales);
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

    interpretImageQuery(imageBase64, mimeType, locales) {
      return startActiveObservation(
        "ai.interpretImageQuery",
        async (generation) => {
          generation.update({
            model: meta.visionModel ?? meta.textModel,
            metadata: { provider: meta.provider },
            input: {
              locales,
              image: redactBase64ImageInput(mimeType, imageBase64),
            },
          });
          try {
            const result = await provider.interpretImageQuery(imageBase64, mimeType, locales);
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

    interpretVoiceAudio(audio, mimeType, locales) {
      return startActiveObservation(
        "ai.interpretVoiceAudio",
        async (generation) => {
          generation.update({
            model: meta.voiceModel ?? meta.textModel,
            metadata: { provider: meta.provider },
            input: {
              locales,
              audio: redactBinaryInput(mimeType, audio),
            },
          });
          try {
            const result = await provider.interpretVoiceAudio(audio, mimeType, locales);
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

    enhanceVoiceTranscript(transcript, locales) {
      return startActiveObservation(
        "ai.enhanceVoiceTranscript",
        async (generation) => {
          generation.update({
            model: meta.textModel,
            metadata: { provider: meta.provider },
            input: { transcript, locales },
          });
          try {
            const result = await provider.enhanceVoiceTranscript(transcript, locales);
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

    suggestSearchTerms(query, locales, limit = 8) {
      return startActiveObservation(
        "ai.suggestSearchTerms",
        async (generation) => {
          generation.update({
            model: meta.textModel,
            metadata: { provider: meta.provider },
            input: { query, locales, limit },
          });
          try {
            const result = await provider.suggestSearchTerms(query, locales, limit);
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

    summarizeVoiceResults(count, topProductName, locales) {
      return startActiveObservation(
        "ai.summarizeVoiceResults",
        async (generation) => {
          generation.update({
            model: meta.textModel,
            metadata: { provider: meta.provider },
            input: { count, topProductName, locales },
          });
          try {
            const result = await provider.summarizeVoiceResults(count, topProductName, locales);
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
  };
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
