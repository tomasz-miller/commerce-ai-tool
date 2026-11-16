import { Injectable, inject } from "@angular/core";
import {
  createCommerceAIApiClient,
  type ImageSearchRequest,
  type InterpretedSearchFilters,
  type MissionSearchResult,
  type ProductCard,
  type SearchRequestBody,
  type SearchResult,
  type SuggestedFacet,
  type SuggestionsResult,
  type VoiceSearchRequest,
} from "@commerce-ai-tool/core/client";
import { COMMERCE_AI_FETCH } from "./commerce-ai-fetch.token";

export interface SearchLocaleFields {
  queryLocale?: string;
  catalogLocale?: string;
  /** @deprecated Use queryLocale */
  locale?: string;
}

export interface SearchRequestOptions {
  filters?: InterpretedSearchFilters;
  searchTerms?: string[];
  refineQuery?: string;
  includeFacets?: boolean;
  suggestedFacets?: SuggestedFacet[];
  enableMissions?: boolean;
  /** Facet groups the shopper clicked a chip in; see `SearchRequestBody.facetSelections`. */
  facetSelections?: Record<string, string[]>;
}

export interface VoiceSearchResult {
  transcript: string;
  enhancedQuery?: string;
  products: ProductCard[];
  meta: SearchResult["meta"];
  mission?: MissionSearchResult;
  ttsText?: string;
  audioSummary?: string;
  ttsPending?: boolean;
}

function buildLocalePayload(
  options: SearchLocaleFields,
): Pick<SearchRequestBody, "catalogLocale" | "queryLocale"> {
  const payload: Pick<SearchRequestBody, "catalogLocale" | "queryLocale"> = {};
  const queryLocale = options.queryLocale ?? options.locale;

  if (options.catalogLocale) {
    payload.catalogLocale = options.catalogLocale;
  }

  if (queryLocale) {
    payload.queryLocale = queryLocale;
  }

  return payload;
}

/**
 * Typed calls to the host API routes on top of the shared browser client from
 * `@commerce-ai-tool/core/client`. Every method rejects with a `CommerceAIApiError` for a non-2xx
 * response and with an `AbortError` when `signal` aborts. Requests go through `COMMERCE_AI_FETCH`.
 */
@Injectable({ providedIn: "root" })
export class CommerceAiApiService {
  private readonly fetch = inject(COMMERCE_AI_FETCH);

  private client(apiBaseUrl: string) {
    return createCommerceAIApiClient({ baseUrl: apiBaseUrl, fetch: this.fetch });
  }

  search(
    apiBaseUrl: string,
    query: string,
    locales: SearchLocaleFields = {},
    signal?: AbortSignal,
    options: SearchRequestOptions = {},
  ): Promise<SearchResult> {
    return this.client(apiBaseUrl).search(
      { query, ...options, ...buildLocalePayload(locales) },
      { signal },
    );
  }

  suggest(
    apiBaseUrl: string,
    query: string,
    locales: SearchLocaleFields = {},
    signal?: AbortSignal,
  ): Promise<SuggestionsResult> {
    return this.client(apiBaseUrl).suggest(
      { query, ...buildLocalePayload(locales) },
      { signal },
    );
  }

  searchByImage(
    apiBaseUrl: string,
    file: File,
    locales: SearchLocaleFields = {},
    enableMissions = false,
    signal?: AbortSignal,
  ): Promise<SearchResult & { interpretation?: string }> {
    const fields: ImageSearchRequest = {
      ...buildLocalePayload(locales),
      ...(enableMissions ? { enableMissions: "true" } : {}),
    };
    return this.client(apiBaseUrl).searchByImage(file, fields, { signal });
  }

  searchByVoice(
    apiBaseUrl: string,
    audio: Blob,
    locales: SearchLocaleFields = {},
    enableTts = true,
    enableMissions = false,
    signal?: AbortSignal,
  ): Promise<VoiceSearchResult> {
    const fields: VoiceSearchRequest = {
      ...buildLocalePayload(locales),
      enableTts: String(enableTts),
      ...(enableMissions ? { enableMissions: "true" } : {}),
    };
    return this.client(apiBaseUrl).searchByVoice(audio, fields, { signal });
  }

  synthesizeSpeech(apiBaseUrl: string, text: string, signal?: AbortSignal): Promise<Blob> {
    return this.client(apiBaseUrl).tts({ text }, { signal });
  }
}
