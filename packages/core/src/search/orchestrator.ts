import { createAIProvider } from "../ai/index.js";
import { createCommercetoolsClient } from "../commercetools/client.js";
import { resolveSearchLocales } from "../locale/resolve.js";
import { buildProductSearchBody } from "../prompts/index.js";
import { buildTtsSummaryFallback } from "./voice-tts.js";
import { logSearchTrace } from "../utils/dev-trace.js";
import type {
  CommerceAIConfig,
  ImageSearchResult,
  SearchLocaleContext,
  SearchLocaleOptions,
  SearchResult,
  TextSearchRequest,
  VoiceSearchResult,
} from "../types/index.js";

export interface SearchOrchestrator {
  searchByText(request: TextSearchRequest): Promise<SearchResult>;
  searchByVoice(
    audio: Uint8Array,
    mimeType: string,
    options?: SearchLocaleOptions & { limit?: number; enableTts?: boolean },
  ): Promise<VoiceSearchResult & { ttsText?: string }>;
  searchByImage(
    image: Uint8Array,
    mimeType: string,
    options?: SearchLocaleOptions & { limit?: number },
  ): Promise<ImageSearchResult>;
}

export interface SearchOrchestratorDeps {
  config: CommerceAIConfig;
  transcribeAudio?: (audio: Uint8Array, mimeType: string) => Promise<string>;
}

export function createSearchOrchestrator(deps: SearchOrchestratorDeps): SearchOrchestrator {
  const { config } = deps;
  const limit = config.defaults?.limit ?? 20;
  const currency = config.defaults?.currency ?? "EUR";

  const ai = createAIProvider(config.ai);
  const ct = createCommercetoolsClient(config.commercetools);

  function resolveLocales(request?: SearchLocaleOptions): SearchLocaleContext {
    return resolveSearchLocales({ defaults: config.defaults, request });
  }

  async function executeSearch(
    interpreted: Awaited<ReturnType<typeof ai.interpretTextQuery>>,
    locales: SearchLocaleContext,
    searchLimit: number,
    offset = 0,
  ): Promise<SearchResult> {
    const body = buildProductSearchBody(interpreted, locales.catalogLocale, searchLimit, offset);

    logSearchTrace("ai", {
      searchTerms: interpreted.searchTerms,
      interpretation: interpreted.interpretation,
      catalogLocale: locales.catalogLocale,
    });

    const { productIds, total } = await ct.searchProducts(body, { currency });
    const products = await ct.getProductProjections(productIds, locales.catalogLocale, currency);

    return {
      products,
      meta: {
        total,
        limit: searchLimit,
        offset,
        locale: locales.catalogLocale,
        catalogLocale: locales.catalogLocale,
        queryLocale: locales.queryLocale,
        queryInterpretation: interpreted.interpretation,
      },
    };
  }

  return {
    async searchByText(request) {
      const locales = resolveLocales(request);
      const searchLimit = request.limit ?? limit;

      logSearchTrace("input", {
        query: request.query,
        queryLocale: locales.queryLocale,
        catalogLocale: locales.catalogLocale,
      });

      const interpreted = await ai.interpretTextQuery(request.query, locales);
      return executeSearch(interpreted, locales, searchLimit, request.offset ?? 0);
    },

    async searchByVoice(audio, mimeType, options = {}) {
      if (!deps.transcribeAudio) {
        throw new Error("Voice search requires a transcribeAudio implementation");
      }

      const locales = resolveLocales(options);
      const searchLimit = options.limit ?? limit;

      logSearchTrace("input", {
        type: "voice",
        mimeType,
        queryLocale: locales.queryLocale,
        catalogLocale: locales.catalogLocale,
      });

      const transcript = await deps.transcribeAudio(audio, mimeType);
      const enhancedQuery = await ai.enhanceVoiceTranscript(transcript, locales);
      const interpreted = await ai.interpretTextQuery(enhancedQuery, locales);
      const result = await executeSearch(interpreted, locales, searchLimit);

      let ttsText: string | undefined;
      if (options.enableTts !== false) {
        try {
          ttsText = await ai.summarizeVoiceResults(
            result.products.length,
            result.products[0]?.name,
            locales,
          );
        } catch {
          ttsText = buildTtsSummaryFallback(
            result.products.length,
            result.products[0]?.name,
            locales.queryLocale,
          );
        }
      }

      return {
        ...result,
        transcript,
        enhancedQuery,
        ttsText,
      };
    },

    async searchByImage(image, mimeType, options = {}) {
      const locales = resolveLocales(options);
      const searchLimit = options.limit ?? limit;

      logSearchTrace("input", {
        type: "image",
        mimeType,
        queryLocale: locales.queryLocale,
        catalogLocale: locales.catalogLocale,
      });

      const base64 = uint8ArrayToBase64(image);
      const interpreted = await ai.interpretImageQuery(base64, mimeType, locales);
      const result = await executeSearch(interpreted, locales, searchLimit);

      return {
        ...result,
        interpretation: interpreted.interpretation,
      };
    },
  };
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }

  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }

  return btoa(binary);
}
