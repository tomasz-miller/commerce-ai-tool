import { Injectable } from "@angular/core";
import type {
  InterpretedSearchFilters,
  MissionSearchResult,
  ProductCard,
  SearchResult,
  SuggestedFacet,
  SuggestionsResult,
} from "@commerce-ai-tool/core/client";

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

function buildLocalePayload(options: SearchLocaleFields): Record<string, string> {
  const payload: Record<string, string> = {};
  const queryLocale = options.queryLocale ?? options.locale;

  if (options.catalogLocale) {
    payload.catalogLocale = options.catalogLocale;
  }

  if (queryLocale) {
    payload.queryLocale = queryLocale;
  }

  return payload;
}

@Injectable({ providedIn: "root" })
export class CommerceAiApiService {
  search(
    apiBaseUrl: string,
    query: string,
    locales: SearchLocaleFields = {},
    signal?: AbortSignal,
    options: SearchRequestOptions = {},
  ): Promise<SearchResult> {
    const baseUrl = apiBaseUrl.replace(/\/$/, "");
    return fetch(`${baseUrl}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, ...options, ...buildLocalePayload(locales) }),
      signal,
    }).then(async (response) => {
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error ?? "Search failed");
      }
      return response.json() as Promise<SearchResult>;
    });
  }

  suggest(
    apiBaseUrl: string,
    query: string,
    locales: SearchLocaleFields = {},
    signal?: AbortSignal,
  ): Promise<SuggestionsResult> {
    const baseUrl = apiBaseUrl.replace(/\/$/, "");
    return fetch(`${baseUrl}/search/suggestions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, ...buildLocalePayload(locales) }),
      signal,
    }).then(async (response) => {
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error ?? "Suggestions failed");
      }
      return response.json() as Promise<SuggestionsResult>;
    });
  }

  searchByImage(
    apiBaseUrl: string,
    file: File,
    locales: SearchLocaleFields = {},
    enableMissions = false,
  ): Promise<SearchResult & { interpretation?: string }> {
    const baseUrl = apiBaseUrl.replace(/\/$/, "");
    const formData = new FormData();
    formData.append("image", file);
    for (const [key, value] of Object.entries(buildLocalePayload(locales))) {
      formData.append(key, value);
    }
    if (enableMissions) {
      formData.append("enableMissions", "true");
    }

    return fetch(`${baseUrl}/search/image`, {
      method: "POST",
      body: formData,
    }).then(async (response) => {
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error ?? "Image search failed");
      }
      return response.json() as Promise<SearchResult & { interpretation?: string }>;
    });
  }

  searchByVoice(
    apiBaseUrl: string,
    audio: Blob,
    locales: SearchLocaleFields = {},
    enableTts = true,
    enableMissions = false,
  ): Promise<VoiceSearchResult> {
    const baseUrl = apiBaseUrl.replace(/\/$/, "");
    const formData = new FormData();
    formData.append("audio", audio, "recording.webm");
    for (const [key, value] of Object.entries(buildLocalePayload(locales))) {
      formData.append(key, value);
    }
    formData.append("enableTts", String(enableTts));
    if (enableMissions) {
      formData.append("enableMissions", "true");
    }

    return fetch(`${baseUrl}/search/voice`, {
      method: "POST",
      body: formData,
    }).then(async (response) => {
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error ?? "Voice search failed");
      }
      return response.json() as Promise<VoiceSearchResult>;
    });
  }

  synthesizeSpeech(apiBaseUrl: string, text: string): Promise<Blob> {
    const baseUrl = apiBaseUrl.replace(/\/$/, "");
    return fetch(`${baseUrl}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    }).then(async (response) => {
      if (!response.ok) {
        throw new Error("TTS failed");
      }
      return response.blob();
    });
  }
}
