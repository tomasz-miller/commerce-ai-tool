import { createAIProvider } from "../ai/index.js";
import { createCommercetoolsClient } from "../commercetools/client.js";
import { buildProductSearchBody } from "../prompts/index.js";
import type {
  CommerceAIConfig,
  ImageSearchResult,
  SearchResult,
  TextSearchRequest,
  VoiceSearchResult,
} from "../types/index.js";

export interface SearchOrchestrator {
  searchByText(request: TextSearchRequest): Promise<SearchResult>;
  searchByVoice(
    audio: Uint8Array,
    mimeType: string,
    options?: { locale?: string; limit?: number; enableTts?: boolean },
  ): Promise<VoiceSearchResult & { ttsText?: string }>;
  searchByImage(
    image: Uint8Array,
    mimeType: string,
    options?: { locale?: string; limit?: number },
  ): Promise<ImageSearchResult>;
}

export interface SearchOrchestratorDeps {
  config: CommerceAIConfig;
  transcribeAudio?: (audio: Uint8Array, mimeType: string) => Promise<string>;
}

export function createSearchOrchestrator(deps: SearchOrchestratorDeps): SearchOrchestrator {
  const { config } = deps;
  const locale = config.defaults?.locale ?? "en";
  const limit = config.defaults?.limit ?? 20;
  const currency = config.defaults?.currency ?? "EUR";

  const ai = createAIProvider(config.ai);
  const ct = createCommercetoolsClient(config.commercetools);

  async function executeSearch(
    interpreted: Awaited<ReturnType<typeof ai.interpretTextQuery>>,
    searchLocale: string,
    searchLimit: number,
    offset = 0,
  ): Promise<SearchResult> {
    const body = buildProductSearchBody(interpreted, searchLocale, searchLimit, offset);
    const { productIds, total } = await ct.searchProducts(body, { currency });
    const products = await ct.getProductProjections(productIds, searchLocale, currency);

    return {
      products,
      meta: {
        total,
        limit: searchLimit,
        offset,
        locale: searchLocale,
        queryInterpretation: interpreted.interpretation,
      },
    };
  }

  return {
    async searchByText(request) {
      const searchLocale = request.locale ?? locale;
      const searchLimit = request.limit ?? limit;
      const interpreted = await ai.interpretTextQuery(request.query, searchLocale);
      return executeSearch(interpreted, searchLocale, searchLimit, request.offset ?? 0);
    },

    async searchByVoice(audio, mimeType, options = {}) {
      if (!deps.transcribeAudio) {
        throw new Error("Voice search requires a transcribeAudio implementation");
      }

      const searchLocale = options.locale ?? locale;
      const searchLimit = options.limit ?? limit;
      const transcript = await deps.transcribeAudio(audio, mimeType);
      const enhancedQuery = await ai.enhanceVoiceTranscript(transcript, searchLocale);
      const interpreted = await ai.interpretTextQuery(enhancedQuery, searchLocale);
      const result = await executeSearch(interpreted, searchLocale, searchLimit);

      const ttsText =
        options.enableTts !== false
          ? buildTtsSummary(result.products.length, result.products[0]?.name)
          : undefined;

      return {
        ...result,
        transcript,
        enhancedQuery,
        ttsText,
      };
    },

    async searchByImage(image, mimeType, options = {}) {
      const searchLocale = options.locale ?? locale;
      const searchLimit = options.limit ?? limit;
      const base64 = uint8ArrayToBase64(image);
      const interpreted = await ai.interpretImageQuery(base64, mimeType, searchLocale);
      const result = await executeSearch(interpreted, searchLocale, searchLimit);

      return {
        ...result,
        interpretation: interpreted.interpretation,
      };
    },
  };
}

function buildTtsSummary(count: number, topProductName?: string): string {
  if (count === 0) {
    return "No products found for your search.";
  }

  if (topProductName) {
    return `Found ${count} product${count === 1 ? "" : "s"}. Top result: ${topProductName}.`;
  }

  return `Found ${count} product${count === 1 ? "" : "s"}.`;
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
