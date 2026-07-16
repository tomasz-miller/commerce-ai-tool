export interface SearchCacheConfig {
  ttlMs?: number;
  maxEntries?: number;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class SearchCache<T> {
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly store = new Map<string, CacheEntry<T>>();

  constructor(config?: SearchCacheConfig) {
    this.ttlMs = config?.ttlMs ?? 60_000;
    this.maxEntries = config?.maxEntries ?? 500;
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      return undefined;
    }

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }

    return entry.value;
  }

  set(key: string, value: T): void {
    if (this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey) {
        this.store.delete(oldestKey);
      }
    }

    this.store.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
  }
}

export function normalizeCacheKeyPart(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function buildTextSearchCacheKey(
  query: string,
  queryLocale: string,
  catalogLocale: string,
  limit: number,
): string {
  return [
    "text",
    normalizeCacheKeyPart(query),
    queryLocale,
    catalogLocale,
    String(limit),
  ].join("|");
}

export function buildInterpretedSearchCacheKey(
  interpretedKey: string,
  catalogLocale: string,
  limit: number,
): string {
  return ["search", interpretedKey, catalogLocale, String(limit)].join("|");
}

export function buildSuggestionsCacheKey(
  query: string,
  suggestLocale: string,
  limit: number,
): string {
  return [
    "suggest",
    normalizeCacheKeyPart(query),
    suggestLocale,
    String(limit),
  ].join("|");
}

export function buildImageSearchCacheKey(
  imageHash: string,
  mimeType: string,
  queryLocale: string,
  catalogLocale: string,
  limit: number,
): string {
  return ["image", imageHash, mimeType, queryLocale, catalogLocale, String(limit)].join("|");
}

export function buildVoiceSearchCacheKey(
  audioHash: string,
  mimeType: string,
  voiceMode: string,
  queryLocale: string,
  catalogLocale: string,
  limit: number,
  enableTts: boolean,
): string {
  return [
    "voice",
    voiceMode,
    enableTts ? "tts" : "no-tts",
    audioHash,
    mimeType,
    queryLocale,
    catalogLocale,
    String(limit),
  ].join("|");
}
