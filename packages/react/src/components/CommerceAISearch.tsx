import { useCallback, useMemo, useRef, useState } from "react";
import { Camera, ImageIcon, Mic, Package, Search, SearchX, Square, Volume2 } from "lucide-react";
import type { CommerceAISearchMessages, ProductCard, ThemeMode } from "@commerce-ai-tool/core";
import { resolveCommerceAISearchMessages } from "@commerce-ai-tool/core";
import { useCommerceAISearch } from "../hooks/useCommerceAISearch.js";
import { useCameraCapture } from "../hooks/useCameraCapture.js";
import { useRecordingDuration } from "../hooks/useRecordingDuration.js";
import { useVoiceSearch } from "../hooks/useVoiceSearch.js";
import { CameraCaptureOverlay } from "./CameraCaptureOverlay.js";
import { SearchFacets } from "./SearchFacets.js";
import { VoiceStatusBanner } from "./VoiceStatusBanner.js";
import type { CameraFacingMode } from "../utils/camera.js";
import "../styles/commerce-ai-search.css";

export type SearchMode = "text" | "image" | "voice" | null;

export interface CommerceAISearchProps {
  apiBaseUrl: string;
  theme?: ThemeMode;
  /** Language products are indexed in commercetools */
  catalogLocale?: string;
  /** Language of the user search input */
  queryLocale?: string;
  /** @deprecated Use queryLocale */
  locale?: string;
  placeholder?: string;
  messages?: Partial<CommerceAISearchMessages>;
  enableAutocomplete?: boolean;
  enableFacets?: boolean;
  persistSession?: boolean;
  enableVoice?: boolean;
  enableImageSearch?: boolean;
  enableCameraSearch?: boolean;
  cameraFacingMode?: CameraFacingMode;
  enableTts?: boolean;
  className?: string;
  onProductSelect?: (product: ProductCard) => void;
}

export function CommerceAISearch({
  apiBaseUrl,
  theme = "auto",
  catalogLocale,
  queryLocale,
  locale,
  placeholder,
  messages: messageOverrides,
  enableAutocomplete = false,
  enableFacets = false,
  persistSession = true,
  enableVoice = true,
  enableImageSearch = true,
  enableCameraSearch = true,
  cameraFacingMode = "environment",
  enableTts = true,
  className,
  onProductSelect,
}: CommerceAISearchProps) {
  const messages = useMemo(
    () =>
      resolveCommerceAISearchMessages({
        ...messageOverrides,
        ...(placeholder ? { placeholder } : {}),
      }),
    [messageOverrides, placeholder],
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [lastSearchMode, setLastSearchMode] = useState<SearchMode>(null);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);

  const camera = useCameraCapture({ facingMode: cameraFacingMode });

  const {
    query,
    setQuery,
    suggestions,
    isLoadingSuggestions,
    suggestionsError,
    suggestionsReady,
    selectSuggestion,
    results,
    isLoading,
    hasSearched,
    setHasSearched,
    error,
    meta,
    search,
    searchByImage,
    setResults,
    setMeta,
    setError,
    setIsLoading,
    facets = [],
    suggestedFacets = [],
    refineFilters = async () => undefined,
    refine = async () => undefined,
    startNewSearch = async () => undefined,
  } = useCommerceAISearch({
    apiBaseUrl,
    catalogLocale,
    queryLocale,
    locale,
    enableAutocomplete,
    enableFacets,
    persistSession,
  });

  const voice = useVoiceSearch({
    apiBaseUrl,
    catalogLocale,
    queryLocale,
    locale,
    enableTts,
    onResults: (products, resultMeta) => {
      setLastSearchMode("voice");
      setResults(products);
      setMeta(resultMeta);
      setError(null);
      setIsLoading(false);
      setHasSearched(true);
    },
    onTranscript: (transcript) => setQuery(transcript, { search: false }),
  });

  const recordingDuration = useRecordingDuration(voice.isRecording);
  const showVoiceBanner =
    voice.isRecording || voice.isProcessing || voice.isLoadingTts || Boolean(voice.error);

  const displayResults = results;
  const showEmptyResults =
    !isLoading && !error && hasSearched && displayResults.length === 0 && query.trim().length > 0;
  const showResults =
    query.trim().length > 0 &&
    (isLoading || !!error || displayResults.length > 0 || showEmptyResults);
  const showSuggestions =
    enableAutocomplete &&
    !suggestionsDismissed &&
    !showResults &&
    query.trim().length >= 2 &&
    (isLoadingSuggestions ||
      suggestions.length > 0 ||
      !!suggestionsError ||
      suggestionsReady);

  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      setLastSearchMode("text");
      voice.clearAudioSummary();
      setActiveSuggestionIndex(-1);

      if (
        enableAutocomplete &&
        activeSuggestionIndex >= 0 &&
        suggestions[activeSuggestionIndex]
      ) {
        selectSuggestion(suggestions[activeSuggestionIndex]!);
        return;
      }

      if (enableFacets && meta?.searchTerms) {
        void refine(query);
      } else {
        void search(query);
      }
    },
    [
      activeSuggestionIndex,
      enableAutocomplete,
      enableFacets,
      meta?.searchTerms,
      query,
      refine,
      search,
      selectSuggestion,
      suggestions,
      voice,
    ],
  );

  const handleQueryChange = useCallback(
    (value: string) => {
      setActiveSuggestionIndex(-1);
      setSuggestionsDismissed(false);
      const trimmed = value.trim();
      if (!trimmed) {
        setLastSearchMode(null);
        voice.clearAudioSummary();
      } else if (trimmed.length >= 2) {
        setLastSearchMode("text");
        voice.clearAudioSummary();
      }
      setQuery(value);
    },
    [setQuery, voice],
  );

  const handleSuggestionSelect = useCallback(
    (suggestion: string) => {
      setActiveSuggestionIndex(-1);
      setLastSearchMode("text");
      voice.clearAudioSummary();
      selectSuggestion(suggestion);
    },
    [selectSuggestion, voice],
  );

  const handleInputKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Escape") {
        setActiveSuggestionIndex(-1);
        setSuggestionsDismissed(true);
        return;
      }

      if (!showSuggestions || suggestions.length === 0) {
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveSuggestionIndex((current) =>
          current < suggestions.length - 1 ? current + 1 : 0,
        );
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveSuggestionIndex((current) =>
          current > 0 ? current - 1 : suggestions.length - 1,
        );
        return;
      }

      if (event.key === "Enter" && activeSuggestionIndex >= 0) {
        event.preventDefault();
        const suggestion = suggestions[activeSuggestionIndex];
        if (suggestion) {
          handleSuggestionSelect(suggestion);
        }
      }
    },
    [activeSuggestionIndex, handleSuggestionSelect, showSuggestions, suggestions],
  );

  const handleImageSelect = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) return;
      setLastSearchMode("image");
      voice.clearAudioSummary();
      void searchByImage(file);
    },
    [searchByImage, voice],
  );

  const handleCameraCapture = useCallback(
    async (video: HTMLVideoElement) => {
      try {
        const file = await camera.capturePhoto(video);
        handleImageSelect(file);
      } catch (err) {
        camera.close();
        setError(err instanceof Error ? err.message : messages.couldNotCapturePhoto);
      }
    },
    [camera, handleImageSelect, messages.couldNotCapturePhoto, setError],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setIsDragging(false);
      const file = event.dataTransfer.files[0];
      if (file) handleImageSelect(file);
    },
    [handleImageSelect],
  );

  const showVoiceReplay =
    enableTts && lastSearchMode === "voice" && Boolean(voice.audioSummary);

  return (
    <div
      className={`cat-root cat-wrapper ${className ?? ""}`}
      data-theme={theme}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      role="search"
      aria-label={messages.productSearchAriaLabel}
    >
      {isDragging && enableImageSearch && (
        <div className="cat-drag-overlay" aria-hidden="true">
          {messages.dropImageToSearch}
        </div>
      )}

      <form
        className={`cat-search-bar ${voice.isRecording ? "cat-search-bar--voice-active" : ""}`}
        onSubmit={handleSubmit}
      >
        <Search size={18} aria-hidden="true" color="var(--cat-text-muted)" />
        <div className="cat-search-input-wrap">
          <input
            type="search"
            className="cat-search-input"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder={messages.placeholder}
            aria-label={messages.searchAriaLabel}
            aria-haspopup={enableAutocomplete ? "listbox" : undefined}
            aria-autocomplete={enableAutocomplete ? "list" : undefined}
            aria-expanded={showSuggestions}
            aria-controls={showSuggestions ? "cat-suggestions-listbox" : undefined}
            aria-activedescendant={
              activeSuggestionIndex >= 0 ? `cat-suggestion-${activeSuggestionIndex}` : undefined
            }
            autoComplete="off"
            role={enableAutocomplete ? "combobox" : undefined}
          />
        </div>

        {enableVoice && (
          <button
            type="button"
            className={`cat-icon-btn ${voice.isRecording ? "cat-icon-btn--active" : ""}`}
            onClick={() => void voice.toggleRecording()}
            disabled={voice.isProcessing}
            aria-label={voice.isRecording ? messages.stopRecording : messages.voiceSearch}
            aria-pressed={voice.isRecording}
          >
            {voice.isRecording ? <Square size={16} /> : <Mic size={16} />}
          </button>
        )}

        {enableImageSearch && (
          <>
            {enableCameraSearch && (
              <>
                <button
                  type="button"
                  className="cat-icon-btn"
                  onClick={() => camera.open(cameraInputRef)}
                  disabled={isLoading}
                  aria-label={messages.searchByCamera}
                >
                  <Camera size={16} />
                </button>
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture={cameraFacingMode}
                  className="cat-hidden-input"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) handleImageSelect(file);
                  }}
                />
              </>
            )}
            <button
              type="button"
              className="cat-icon-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              aria-label={messages.searchByImage}
            >
              <ImageIcon size={16} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="cat-hidden-input"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImageSelect(file);
              }}
            />
          </>
        )}

        {showVoiceReplay && (
          <button
            type="button"
            className="cat-icon-btn"
            onClick={() => voice.replayAudioSummary()}
            aria-label={messages.replayVoiceSummary}
          >
            <Volume2 size={16} />
          </button>
        )}

        {showSuggestions && (
          <div
            id="cat-suggestions-listbox"
            className="cat-suggestions"
            role="listbox"
            aria-label={messages.suggestionsAriaLabel}
          >
            {isLoadingSuggestions && suggestions.length === 0 && !suggestionsError && (
              <div className="cat-suggestions__status">{messages.loadingSuggestions}</div>
            )}

            {suggestionsError && (
              <div className="cat-suggestions__status cat-suggestions__status--error" role="alert">
                {suggestionsError}
              </div>
            )}

            {!isLoadingSuggestions &&
              !suggestionsError &&
              suggestionsReady &&
              suggestions.length === 0 && (
                <div className="cat-suggestions__status">{messages.noSuggestions}</div>
              )}

            {suggestions.map((suggestion, index) => (
              <button
                key={`${index}-${suggestion}`}
                id={`cat-suggestion-${index}`}
                type="button"
                className={`cat-suggestions__item ${
                  index === activeSuggestionIndex ? "cat-suggestions__item--active" : ""
                }`}
                role="option"
                aria-selected={index === activeSuggestionIndex}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => handleSuggestionSelect(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </form>

      {showVoiceBanner && (
        <VoiceStatusBanner
          isRecording={voice.isRecording}
          isProcessing={voice.isProcessing}
          isLoadingTts={voice.isLoadingTts}
          error={voice.error}
          durationSeconds={recordingDuration}
          messages={messages}
          onDismissError={voice.clearError}
        />
      )}

      {enableFacets && lastSearchMode === "text" && hasSearched && (
        <SearchFacets
          facets={facets}
          suggestedFacets={suggestedFacets}
          filters={meta?.appliedFilters ?? {}}
          messages={messages}
          onChange={(filters) => void refineFilters(filters)}
          onNewSearch={() => void startNewSearch()}
        />
      )}

      {enableCameraSearch && (camera.isOpen || camera.error) && (
        <CameraCaptureOverlay
          stream={camera.stream}
          error={camera.error}
          messages={messages}
          onCapture={(video) => void handleCameraCapture(video)}
          onClose={camera.close}
          onDismissError={camera.clearError}
        />
      )}

      {showResults && (
        <div className="cat-results" role="listbox" aria-label={messages.searchResultsAriaLabel}>
          {isLoading && <div className="cat-status">{messages.searching}</div>}
          {error && <div className="cat-status cat-status--error">{error}</div>}

          {!isLoading &&
            displayResults.map((product) => (
              <button
                key={product.id}
                type="button"
                className="cat-result-item"
                role="option"
                onClick={() => onProductSelect?.(product)}
              >
                {product.imageUrl ? (
                  <img
                    src={product.imageUrl}
                    alt=""
                    className="cat-result-image"
                    loading="lazy"
                  />
                ) : (
                  <div className="cat-result-image cat-result-image--placeholder">
                    <Package size={20} color="var(--cat-text-muted)" />
                  </div>
                )}
                <div className="cat-result-info">
                  <div className="cat-result-name">{product.name}</div>
                  {product.price && (
                    <div className="cat-result-price">{product.price.formatted}</div>
                  )}
                </div>
              </button>
            ))}

          {!isLoading && !error && displayResults.length === 0 && showEmptyResults && (
            <div className="cat-status cat-status--empty" role="status" aria-live="polite">
              <SearchX size={18} aria-hidden="true" />
              <div className="cat-status__content">
                <div className="cat-status__title">{messages.noProductsFound}</div>
                {meta?.queryInterpretation && (
                  <div className="cat-status__hint">
                    {messages.searchedFor} {meta.queryInterpretation}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
