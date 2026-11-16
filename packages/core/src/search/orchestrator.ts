import type {
  ImageSearchResult,
  ResolvedFacetSchema,
  SearchLocaleOptions,
  SearchResult,
  SuggestionsRequest,
  SuggestionsResult,
  TextSearchRequest,
  VoiceSearchResult,
} from "../types/index.js";
import { createPipelineContext, resolveFacetSchema, resolveLocales } from "./context.js";
import type { SearchOrchestratorDeps } from "./context.js";
import { searchByImage } from "./image-search.js";
import { suggestByText } from "./suggest.js";
import { searchByText } from "./text-search.js";
import { searchByVoice } from "./voice-search.js";

export type { SearchOrchestratorDeps } from "./context.js";
export { VoiceNotConfiguredError } from "./voice-search.js";

export interface SearchOrchestrator {
  searchByText(request: TextSearchRequest): Promise<SearchResult>;
  getFacetSchema(options?: SearchLocaleOptions): Promise<ResolvedFacetSchema>;
  searchByVoice(
    audio: Uint8Array,
    mimeType: string,
    options?: SearchLocaleOptions & {
      limit?: number;
      enableTts?: boolean;
      enableMissions?: boolean;
      /** Aborts every remaining step, including in-flight AI calls. */
      signal?: AbortSignal;
    },
  ): Promise<VoiceSearchResult & { ttsText?: string }>;
  searchByImage(
    image: Uint8Array,
    mimeType: string,
    options?: SearchLocaleOptions & {
      limit?: number;
      enableMissions?: boolean;
      /** Aborts every remaining step, including in-flight AI calls. */
      signal?: AbortSignal;
    },
  ): Promise<ImageSearchResult>;
  suggestByText(request: SuggestionsRequest): Promise<SuggestionsResult>;
}

/** Composition root: builds the shared pipeline context and binds one module per pipeline. */
export function createSearchOrchestrator(deps: SearchOrchestratorDeps): SearchOrchestrator {
  const ctx = createPipelineContext(deps);

  return {
    getFacetSchema: async (options = {}) => resolveFacetSchema(ctx, resolveLocales(ctx, options)),
    searchByText: (request) => searchByText(ctx, request),
    searchByVoice: (audio, mimeType, options) =>
      searchByVoice(ctx, { audio, mimeType }, options),
    searchByImage: (image, mimeType, options) =>
      searchByImage(ctx, { image, mimeType }, options),
    suggestByText: (request) => suggestByText(ctx, request),
  };
}
