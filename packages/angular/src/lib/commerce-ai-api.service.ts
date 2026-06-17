import { Injectable } from "@angular/core";
import type { ProductCard, SearchResult } from "@commerce-ai-tool/core";

@Injectable({ providedIn: "root" })
export class CommerceAiApiService {
  search(
    apiBaseUrl: string,
    query: string,
    locale = "en",
  ): Promise<SearchResult> {
    const baseUrl = apiBaseUrl.replace(/\/$/, "");
    return fetch(`${baseUrl}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, locale }),
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
    locale = "en",
  ): Promise<SearchResult & { interpretation?: string }> {
    const baseUrl = apiBaseUrl.replace(/\/$/, "");
    const formData = new FormData();
    formData.append("image", file);
    formData.append("locale", locale);

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
    locale = "en",
    enableTts = true,
  ): Promise<{
    transcript: string;
    products: ProductCard[];
    meta: SearchResult["meta"];
    audioSummary?: string;
  }> {
    const baseUrl = apiBaseUrl.replace(/\/$/, "");
    const formData = new FormData();
    formData.append("audio", audio, "recording.webm");
    formData.append("locale", locale);
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
        audioSummary?: string;
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
