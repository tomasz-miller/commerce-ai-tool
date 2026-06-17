import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { ProductCard, SearchResult } from "@commerce-ai-tool/core";

export interface UseCommerceAISearchOptions {
  apiBaseUrl: string;
  locale?: string;
  debounceMs?: number;
}

export interface UseCommerceAISearchReturn {
  query: string;
  setQuery: (query: string) => void;
  results: ProductCard[];
  setResults: Dispatch<SetStateAction<ProductCard[]>>;
  meta: SearchResult["meta"] | null;
  setMeta: Dispatch<SetStateAction<SearchResult["meta"] | null>>;
  isLoading: boolean;
  setIsLoading: Dispatch<SetStateAction<boolean>>;
  error: string | null;
  setError: Dispatch<SetStateAction<string | null>>;
  search: (query?: string) => Promise<void>;
  searchByImage: (file: File) => Promise<void>;
  clear: () => void;
}

export function useCommerceAISearch(
  options: UseCommerceAISearchOptions,
): UseCommerceAISearchReturn {
  const { apiBaseUrl, locale = "en", debounceMs = 300 } = options;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductCard[]>([]);
  const [meta, setMeta] = useState<SearchResult["meta"] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const baseUrl = apiBaseUrl.replace(/\/$/, "");

  const search = useCallback(
    async (searchQuery?: string) => {
      const q = (searchQuery ?? query).trim();
      if (!q) return;

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`${baseUrl}/search`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q, locale }),
        });

        if (!response.ok) {
          const data = (await response.json()) as { error?: string };
          throw new Error(data.error ?? "Search failed");
        }

        const data = (await response.json()) as SearchResult;
        setResults(data.products);
        setMeta(data.meta);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Search failed");
        setResults([]);
        setMeta(null);
      } finally {
        setIsLoading(false);
      }
    },
    [baseUrl, locale, query],
  );

  const searchByImage = useCallback(
    async (file: File) => {
      setIsLoading(true);
      setError(null);

      try {
        const formData = new FormData();
        formData.append("image", file);
        formData.append("locale", locale);

        const response = await fetch(`${baseUrl}/search/image`, {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const data = (await response.json()) as { error?: string };
          throw new Error(data.error ?? "Image search failed");
        }

        const data = (await response.json()) as SearchResult & { interpretation?: string };
        setResults(data.products);
        setMeta(data.meta);
        if (data.interpretation) {
          setQuery(data.interpretation);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Image search failed");
        setResults([]);
        setMeta(null);
      } finally {
        setIsLoading(false);
      }
    },
    [baseUrl, locale],
  );

  const setQueryWithDebounce = useCallback(
    (value: string) => {
      setQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (value.trim().length >= 2) {
        debounceRef.current = setTimeout(() => {
          void search(value);
        }, debounceMs);
      }
    },
    [debounceMs, search],
  );

  const clear = useCallback(() => {
    setQuery("");
    setResults([]);
    setMeta(null);
    setError(null);
  }, []);

  return {
    query,
    setQuery: setQueryWithDebounce,
    results,
    setResults,
    meta,
    setMeta,
    isLoading,
    setIsLoading,
    error,
    setError,
    search,
    searchByImage,
    clear,
  };
}
