import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  createCommerceAIApiClient,
  messageForError,
  safeStorage,
  selectedFacetChips,
  trackChipGroups,
  type CommerceAISearchMessages,
  type ImageSearchRequest,
  type InterpretedSearchFilters,
  type MissionSearchResult,
  type ProductCard,
  type SearchFacetGroup,
  type SearchRequestBody,
  type SearchResult,
  type SearchSessionState,
  type SuggestedFacet,
} from "@commerce-ai-tool/core/client";
import { useLatestRef, useMessagesRef } from "./useLatestRef.js";

export { selectedFacetChips, trackChipGroups };

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

export function buildLocalePayload(
  options: SearchLocaleProps,
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

export interface UseCommerceAISearchOptions extends SearchLocaleProps {
  apiBaseUrl: string;
  debounceMs?: number;
  suggestionsDebounceMs?: number;
  enableAutocomplete?: boolean;
  enableFacets?: boolean;
  persistSession?: boolean;
  enableMissions?: boolean;
  /** Host message overrides. Errors are always taken from these, never from the server's text. */
  messages?: Partial<CommerceAISearchMessages>;
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
  mission: MissionSearchResult | null;
  setMission: Dispatch<SetStateAction<MissionSearchResult | null>>;
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
  /**
   * Claims the "current search" slot for a search that runs outside this hook (voice). Aborts the
   * in-flight search, cancels pending debounced searches and forgets clicked chips, exactly like
   * a new `search`. Pass `signal` to the request and drop its response when
   * `isCurrentRequest(requestId)` turned false in the meantime.
   */
  beginExternalSearch?: () => { requestId: number; signal: AbortSignal };
  /** True while `requestId` (from `beginExternalSearch`) is still the latest search. */
  isCurrentRequest?: (requestId: number) => boolean;
  /** True when a facet refinement session is active (not set for mission results). */
  hasFacetSession: boolean;
  facets?: SearchFacetGroup[];
  suggestedFacets?: SuggestedFacet[];
  refineFilters?: (filters: InterpretedSearchFilters) => Promise<void>;
  refine?: (query: string) => Promise<void>;
  /** Clear session and run a fresh AI search with the current query. */
  startNewSearch?: () => Promise<void>;
  /** Apply a search payload (text, voice, or image) and clear the facet session for missions. */
  applySearchResult: (data: SearchResult, queryOverride?: string) => void;
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
    enableFacets = false,
    persistSession = true,
    enableMissions = false,
    messages,
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
  const [mission, setMission] = useState<MissionSearchResult | null>(null);
  const [meta, setMeta] = useState<SearchResult["meta"] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facets, setFacets] = useState<SearchFacetGroup[]>([]);
  const [suggestedFacets, setSuggestedFacets] = useState<SuggestedFacet[]>([]);
  const [searchSession, setSearchSession] = useState<SearchSessionState | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const suggestionsAbortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const suggestionsRequestIdRef = useRef(0);
  const queryRef = useLatestRef(query);
  const messagesRef = useMessagesRef(messages);
  /** Facet groups the shopper clicked a chip in; cleared whenever a new search starts. */
  const chipGroupsRef = useRef<Set<string>>(new Set());
  /** True while a refinement result is applied, so it does not reset the tracked chips. */
  const keepChipGroupsRef = useRef(false);

  const baseUrl = apiBaseUrl.replace(/\/$/, "");
  const sessionStorageKey = `cat:search-session:${baseUrl}`;
  // Blocked or full storage (private mode, sandboxed iframe) must not break the widget.
  const storage = useMemo(() => safeStorage("session"), []);
  const client = useMemo(() => createCommerceAIApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const failure = useCallback(
    (err: unknown, fallback: keyof CommerceAISearchMessages) =>
      messageForError(err, messagesRef.current, { fallback }),
    [messagesRef],
  );

  useEffect(() => {
    if (!enableFacets || !persistSession) return;
    const stored = storage.getItem(sessionStorageKey);
    if (!stored) return;
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only restore of the persisted session; sessionStorage is unavailable during SSR
      setSearchSession(JSON.parse(stored) as SearchSessionState);
    } catch {
      storage.removeItem(sessionStorageKey);
    }
  }, [enableFacets, persistSession, sessionStorageKey, storage]);

  useEffect(() => {
    if (!enableFacets || !persistSession || !searchSession) return;
    storage.setItem(sessionStorageKey, JSON.stringify(searchSession));
  }, [enableFacets, persistSession, searchSession, sessionStorageKey, storage]);

  const clearDebounceTimers = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (suggestionsDebounceRef.current) {
      clearTimeout(suggestionsDebounceRef.current);
      suggestionsDebounceRef.current = null;
    }
  }, []);

  // Unmount (or a StrictMode probe): no timer may fire an LLM-backed search for a gone widget, and
  // no in-flight request may write state. Bumping the ids makes late responses stale.
  useEffect(
    () => () => {
      clearDebounceTimers();
      abortRef.current?.abort();
      abortRef.current = null;
      suggestionsAbortRef.current?.abort();
      suggestionsAbortRef.current = null;
      requestIdRef.current += 1;
      suggestionsRequestIdRef.current += 1;
    },
    [clearDebounceTimers],
  );

  /** Makes a new search the current one: cancels what is pending or in flight and starts fresh. */
  const supersedeSearch = useCallback(() => {
    clearDebounceTimers();
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = ++requestIdRef.current;
    chipGroupsRef.current = new Set();
    return { requestId, signal: controller.signal };
  }, [clearDebounceTimers]);

  const resetResults = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    // Whatever was in flight (text, image, voice) is now stale: it must not show results, an
    // error or `hasSearched` after the reset.
    requestIdRef.current += 1;
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
    setMission(null);
    setMeta(null);
    setError(null);
    setIsLoading(false);
    setHasSearched(false);
    setSuggestions([]);
    setSuggestionsError(null);
    setIsLoadingSuggestions(false);
    setSuggestionsReady(false);
    setFacets([]);
    setSuggestedFacets([]);
    setSearchSession(null);
    chipGroupsRef.current = new Set();
    storage.removeItem(sessionStorageKey);
  }, [sessionStorageKey, storage]);

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
        const data = await client.suggest(
          { query: trimmed, ...localePayload },
          { signal: controller.signal },
        );
        if (requestId !== suggestionsRequestIdRef.current) return;

        setSuggestions(data.suggestions);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (requestId !== suggestionsRequestIdRef.current) return;

        setSuggestions([]);
        setSuggestionsError(failure(err, "searchFailed"));
      } finally {
        if (requestId === suggestionsRequestIdRef.current) {
          setIsLoadingSuggestions(false);
          setSuggestionsReady(true);
        }
      }
    },
    [client, enableAutocomplete, failure, localePayload],
  );

  const applySearchResult = useCallback(
    (data: SearchResult, sessionQuery?: string) => {
      if (!keepChipGroupsRef.current) {
        // A text, voice or image result starts a new facet session: no chip was clicked in it.
        chipGroupsRef.current = new Set();
      }
      setResults(data.products);
      setMission(data.mission ?? null);
      setMeta(data.meta);
      setFacets(data.facets ?? []);
      setSuggestedFacets(data.suggestedFacets ?? []);
      if (data.mission) {
        setSearchSession(null);
        storage.removeItem(sessionStorageKey);
      } else if (enableFacets && data.meta.searchTerms) {
        setSearchSession({
          query: sessionQuery?.trim() || queryRef.current || data.meta.queryInterpretation || "",
          searchTerms: data.meta.searchTerms,
          appliedFilters: data.meta.appliedFilters ?? {},
          suggestedFacets: data.suggestedFacets ?? [],
          facetSchema: data.facetSchema,
          schemaEtag: data.meta.schemaEtag,
        });
      }
    },
    [enableFacets, queryRef, sessionStorageKey, storage],
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
      chipGroupsRef.current = new Set();

      setIsLoading(true);
      setError(null);
      setResults([]);
      setMission(null);
      setMeta(null);
      setSuggestions([]);
      setSuggestionsError(null);

      try {
        const data = await client.search(
          {
            query: q,
            includeFacets: enableFacets,
            ...(enableMissions ? { enableMissions: true } : {}),
            ...localePayload,
          },
          { signal: controller.signal },
        );
        if (requestId !== requestIdRef.current) return;

        applySearchResult(data, q);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (requestId !== requestIdRef.current) return;

        setError(failure(err, "searchFailed"));
        setResults([]);
        setMission(null);
        setMeta(null);
      } finally {
        if (requestId === requestIdRef.current) {
          setIsLoading(false);
          setHasSearched(true);
        }
      }
    },
    [applySearchResult, client, enableFacets, enableMissions, failure, localePayload, queryRef],
  );

  const submitRefinement = useCallback(
    async (
      body: {
        filters?: InterpretedSearchFilters;
        refineQuery?: string;
      },
    ) => {
      if (!searchSession) return;

      // A debounced search for text typed before this refinement would otherwise fire after it
      // and replace the refined results.
      clearDebounceTimers();
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const requestId = ++requestIdRef.current;
      setIsLoading(true);
      setError(null);

      try {
        const filters = body.filters ?? searchSession.appliedFilters;
        // A chip click arrives as `body.filters`; a text refine keeps the tracked chips.
        const chipGroups = body.filters
          ? trackChipGroups(chipGroupsRef.current, facets, searchSession.appliedFilters, body.filters)
          : chipGroupsRef.current;
        // Only for clicked chips: an absent field keeps the server's categories-only default.
        const facetSelections = selectedFacetChips(facets, filters, chipGroups);
        const data = await client.search(
          {
            query: searchSession.query,
            searchTerms: searchSession.searchTerms,
            filters,
            refineQuery: body.refineQuery,
            suggestedFacets: searchSession.suggestedFacets,
            includeFacets: true,
            ...(facetSelections ? { facetSelections } : {}),
            ...localePayload,
          },
          { signal: controller.signal },
        );
        if (requestId !== requestIdRef.current) return;
        chipGroupsRef.current = new Set(chipGroups);
        keepChipGroupsRef.current = true;
        try {
          applySearchResult(data, searchSession.query);
        } finally {
          keepChipGroupsRef.current = false;
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (requestId === requestIdRef.current) {
          setError(failure(err, "searchFailed"));
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setIsLoading(false);
          setHasSearched(true);
        }
      }
    },
    [applySearchResult, clearDebounceTimers, client, facets, failure, localePayload, searchSession],
  );

  const refineFilters = useCallback(
    async (filters: InterpretedSearchFilters) => submitRefinement({ filters }),
    [submitRefinement],
  );

  const refine = useCallback(
    async (refineQuery: string) => {
      const trimmed = refineQuery.trim();
      if (trimmed) await submitRefinement({ refineQuery: trimmed });
    },
    [submitRefinement],
  );

  const startNewSearch = useCallback(async () => {
    const previousQuery = searchSession?.query;
    const q = (queryRef.current.trim() || previousQuery || "").trim();
    setSearchSession(null);
    setFacets([]);
    setSuggestedFacets([]);
    chipGroupsRef.current = new Set();
    storage.removeItem(sessionStorageKey);
    if (q) {
      if (!queryRef.current.trim() && previousQuery) {
        setQueryState(previousQuery);
      }
      await search(q);
    }
  }, [queryRef, search, searchSession?.query, sessionStorageKey, storage]);

  const searchByImage = useCallback(
    async (file: File) => {
      const { requestId, signal } = supersedeSearch();

      setIsLoading(true);
      setError(null);
      setResults([]);
      setMission(null);
      setMeta(null);
      setSuggestions([]);

      try {
        const fields: ImageSearchRequest = {
          ...localePayload,
          ...(enableMissions ? { enableMissions: "true" } : {}),
        };
        const data = await client.searchByImage(file, fields, { signal });
        if (requestId !== requestIdRef.current) return;

        applySearchResult(data, data.interpretation);
        if (data.interpretation) {
          setQueryState(data.interpretation);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (requestId !== requestIdRef.current) return;

        setError(failure(err, "imageSearchFailed"));
        setResults([]);
        setMission(null);
        setMeta(null);
      } finally {
        if (requestId === requestIdRef.current) {
          setIsLoading(false);
          setHasSearched(true);
        }
      }
    },
    [applySearchResult, client, enableMissions, failure, localePayload, supersedeSearch],
  );

  const beginExternalSearch = useCallback(() => {
    const request = supersedeSearch();
    // The search this one replaced may have left the spinner on (a debounced or aborted search).
    setIsLoading(false);
    return request;
  }, [supersedeSearch]);

  const isCurrentRequest = useCallback(
    (requestId: number) => requestId === requestIdRef.current,
    [],
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
        // Hide previous results so autocomplete can show while typing after a search.
        setResults([]);
        setMission(null);
        setError(null);
        setIsLoading(false);
        setHasSearched(false);
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
      setMission(null);
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
    mission,
    setMission,
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
    beginExternalSearch,
    isCurrentRequest,
    facets,
    suggestedFacets,
    hasFacetSession: searchSession !== null,
    refineFilters,
    refine,
    startNewSearch,
    applySearchResult,
    clear,
  };
}
