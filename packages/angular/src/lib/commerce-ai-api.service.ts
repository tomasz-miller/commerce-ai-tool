import { Injectable } from "@angular/core";
import type { ProductCard, SearchResult } from "@commerce-ai-tool/core";

export interface SearchLocaleFields {
  queryLocale?: string;
  catalogLocale?: string;
  /** @deprecated Use queryLocale */
  locale?: string;
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
  ): Promise<SearchResult> {
    const baseUrl = apiBaseUrl.replace(/\/$/, "");
    return fetch(`${baseUrl}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, ...buildLocalePayload(locales) }),
      signal,
    }).then(async (response) => {
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error ?? "Search failed");
      }
      return response.json() as Promise<SearchResult>;
    });
  }

  searchByImage(
    apiBaseUrl: string,
    file: File,
    locales: SearchLocaleFields = {},
  ): Promise<SearchResult & { interpretation?: string }> {
    const baseUrl = apiBaseUrl.replace(/\/$/, "");
    const formData = new FormData();
    formData.append("image", file);
    for (const [key, value] of Object.entries(buildLocalePayload(locales))) {
      formData.append(key, value);
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
  ): Promise<{
    transcript: string;
    products: ProductCard[];
    meta: SearchResult["meta"];
    ttsText?: string;
    audioSummary?: string;
    ttsPending?: boolean;
  }> {
    const baseUrl = apiBaseUrl.replace(/\/$/, "");
    const formData = new FormData();
    formData.append("audio", audio, "recording.webm");
    for (const [key, value] of Object.entries(buildLocalePayload(locales))) {
      formData.append(key, value);
    }
    formData.append("enableTts", String(enableTts));

    return fetch(`${baseUrl}/search/voice`, {
      method: "POST",
      body: formData,
    }).then(async (response) => {
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error ?? "Voice search failed");
      }
      return response.json() as Promise<{
        transcript: string;
        products: ProductCard[];
        meta: SearchResult["meta"];
        ttsText?: string;
        audioSummary?: string;
        ttsPending?: boolean;
      }>;
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
