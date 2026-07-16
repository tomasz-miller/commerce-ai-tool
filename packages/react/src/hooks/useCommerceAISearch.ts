import { useCallback, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { ProductCard, SearchResult, SuggestionsResult } from "@commerce-ai-tool/core";

export interface SearchLocaleProps {
  queryLocale?: string;
  catalogLocale?: string;
  /** @deprecated Use queryLocale */
  locale?: string;
}

export interface SetQueryOptions {
  /** When false, only updates the input without triggering a search. */
  search?: boolean;
}

export function buildLocalePayload(options: SearchLocaleProps): Record<string, string> {
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

export function appendLocaleFields(formData: FormData, options: SearchLocaleProps): void {
  const payload = buildLocalePayload(options);
  for (const [key, value] of Object.entries(payload)) {
    formData.append(key, value);
  }
}

export interface UseCommerceAISearchOptions extends SearchLocaleProps {
  apiBaseUrl: string;
  debounceMs?: number;
  suggestionsDebounceMs?: number;
  enableAutocomplete?: boolean;
}

export interface UseCommerceAISearchReturn {
  query: string;
  setQuery: (query: string, options?: SetQueryOptions) => void;
  suggestions: string[];
  isLoadingSuggestions: boolean;
  suggestionsError: string | null;
  suggestionsReady: boolean;
  selectSuggestion: (suggestion: string) => void;
  results: ProductCard[];
  setResults: Dispatch<SetStateAction<ProductCard[]>>;
  meta: SearchResult["meta"] | null;
  setMeta: Dispatch<SetStateAction<SearchResult["meta"] | null>>;
  isLoading: boolean;
  setIsLoading: Dispatch<SetStateAction<boolean>>;
  hasSearched: boolean;
  setHasSearched: Dispatch<SetStateAction<boolean>>;
  error: string | null;
  setError: Dispatch<SetStateAction<string | null>>;
  search: (query?: string) => Promise<void>;
  searchByImage: (file: File) => Promise<void>;
  clear: () => void;
}

export function useCommerceAISearch(
  options: UseCommerceAISearchOptions,
): UseCommerceAISearchReturn {
  const {
    apiBaseUrl,
    debounceMs = 250,
    suggestionsDebounceMs = 200,
    enableAutocomplete = false,
    queryLocale,
    catalogLocale,
    locale,
  } = options;
  const localePayload = useMemo(
    () => buildLocalePayload({ queryLocale, catalogLocale, locale }),
    [queryLocale, catalogLocale, locale],
  );
  const [query, setQueryState] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
  const [suggestionsReady, setSuggestionsReady] = useState(false);
  const [results, setResults] = useState<ProductCard[]>([]);
  const [meta, setMeta] = useState<SearchResult["meta"] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const suggestionsAbortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const suggestionsRequestIdRef = useRef(0);
  const queryRef = useRef(query);
  queryRef.current = query;

  const baseUrl = apiBaseUrl.replace(/\/$/, "");

  const resetResults = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    suggestionsAbortRef.current?.abort();
    suggestionsAbortRef.current = null;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (suggestionsDebounceRef.current) {
      clearTimeout(suggestionsDebounceRef.current);
      suggestionsDebounceRef.current = null;
    }
    setResults([]);
    setMeta(null);
    setError(null);
    setIsLoading(false);
    setHasSearched(false);
    setSuggestions([]);
    setSuggestionsError(null);
    setIsLoadingSuggestions(false);
    setSuggestionsReady(false);
  }, []);

  const fetchSuggestions = useCallback(
    async (searchQuery: string) => {
      const trimmed = searchQuery.trim();
      if (!enableAutocomplete || trimmed.length < 2) {
        setSuggestions([]);
        setSuggestionsError(null);
        setIsLoadingSuggestions(false);
        setSuggestionsReady(false);
        return;
      }

      suggestionsAbortRef.current?.abort();
      const controller = new AbortController();
      suggestionsAbortRef.current = controller;
      const requestId = ++suggestionsRequestIdRef.current;

      setIsLoadingSuggestions(true);
      setSuggestionsError(null);
      setSuggestionsReady(false);

      try {
        const response = await fetch(`${baseUrl}/search/suggestions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: trimmed, ...localePayload }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const data = (await response.json()) as { error?: string };
          throw new Error(data.error ?? "Suggestions failed");
        }

        const data = (await response.json()) as SuggestionsResult;
        if (requestId !== suggestionsRequestIdRef.current) return;

        setSuggestions(data.suggestions);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (requestId !== suggestionsRequestIdRef.current) return;

        setSuggestions([]);
        setSuggestionsError(err instanceof Error ? err.message : "Suggestions failed");
      } finally {
        if (requestId === suggestionsRequestIdRef.current) {
          setIsLoadingSuggestions(false);
          setSuggestionsReady(true);
        }
      }
    },
    [baseUrl, enableAutocomplete, localePayload],
  );

  const search = useCallback(
    async (searchQuery?: string) => {
      const q = (searchQuery ?? queryRef.current).trim();
      if (!q) return;

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      if (suggestionsDebounceRef.current) {
        clearTimeout(suggestionsDebounceRef.current);
        suggestionsDebounceRef.current = null;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const requestId = ++requestIdRef.current;

      setIsLoading(true);
      setError(null);
      setResults([]);
      setMeta(null);
      setSuggestions([]);
      setSuggestionsError(null);

      try {
        const response = await fetch(`${baseUrl}/search`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q, ...localePayload }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const data = (await response.json()) as { error?: string };
          throw new Error(data.error ?? "Search failed");
        }

        const data = (await response.json()) as SearchResult;
        if (requestId !== requestIdRef.current) return;

        setResults(data.products);
        setMeta(data.meta);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (requestId !== requestIdRef.current) return;

        setError(err instanceof Error ? err.message : "Search failed");
        setResults([]);
        setMeta(null);
      } finally {
        if (requestId === requestIdRef.current) {
          setIsLoading(false);
          setHasSearched(true);
        }
      }
    },
    [baseUrl, localePayload],
  );

  const searchByImage = useCallback(
    async (file: File) => {
      abortRef.current?.abort();
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      if (suggestionsDebounceRef.current) {
        clearTimeout(suggestionsDebounceRef.current);
        suggestionsDebounceRef.current = null;
      }

      setIsLoading(true);
      setError(null);
      setResults([]);
      setMeta(null);
      setSuggestions([]);

      try {
        const formData = new FormData();
        formData.append("image", file);
        appendLocaleFields(formData, { queryLocale, catalogLocale, locale });

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
          setQueryState(data.interpretation);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Image search failed");
        setResults([]);
        setMeta(null);
      } finally {
        setIsLoading(false);
        setHasSearched(true);
      }
    },
    [baseUrl, catalogLocale, locale, queryLocale],
  );

  const setQuery = useCallback(
    (value: string, options?: SetQueryOptions) => {
      setQueryState(value);

      if (options?.search === false) {
        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
          debounceRef.current = null;
        }
        if (suggestionsDebounceRef.current) {
          clearTimeout(suggestionsDebounceRef.current);
          suggestionsDebounceRef.current = null;
        }
        return;
      }

      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (suggestionsDebounceRef.current) clearTimeout(suggestionsDebounceRef.current);

      const trimmed = value.trim();
      if (trimmed.length === 0 || trimmed.length < 2) {
        resetResults();
        return;
      }

      if (enableAutocomplete) {
        setIsLoadingSuggestions(true);
        setSuggestionsError(null);
        suggestionsDebounceRef.current = setTimeout(() => {
          void fetchSuggestions(trimmed);
        }, suggestionsDebounceMs);
        return;
      }

      setIsLoading(true);
      setError(null);
      setResults([]);
      setMeta(null);

      debounceRef.current = setTimeout(() => {
        void search(trimmed);
      }, debounceMs);
    },
    [debounceMs, enableAutocomplete, fetchSuggestions, resetResults, search, suggestionsDebounceMs],
  );

  const selectSuggestion = useCallback(
    (suggestion: string) => {
      setQueryState(suggestion);
      setSuggestions([]);
      setSuggestionsError(null);
      void search(suggestion);
    },
    [search],
  );

  const clear = useCallback(() => {
    setQueryState("");
    resetResults();
  }, [resetResults]);

  return {
    query,
    setQuery,
    suggestions,
    isLoadingSuggestions,
    suggestionsError,
    suggestionsReady,
    selectSuggestion,
    results,
    setResults,
    meta,
    setMeta,
    isLoading,
    setIsLoading,
    hasSearched,
    setHasSearched,
    error,
    setError,
    search,
    searchByImage,
    clear,
  };
}
