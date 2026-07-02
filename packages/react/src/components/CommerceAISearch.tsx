import { useCallback, useRef, useState } from "react";
import { ImageIcon, Mic, Package, Search, SearchX, Square, Volume2 } from "lucide-react";
import type { ProductCard, ThemeMode } from "@commerce-ai-tool/core";
import { useCommerceAISearch } from "../hooks/useCommerceAISearch.js";
import { useRecordingDuration } from "../hooks/useRecordingDuration.js";
import { useVoiceSearch } from "../hooks/useVoiceSearch.js";
import { VoiceStatusBanner } from "./VoiceStatusBanner.js";
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
  enableVoice?: boolean;
  enableImageSearch?: boolean;
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
  placeholder = "What are you looking for?",
  enableVoice = true,
  enableImageSearch = true,
  enableTts = true,
  className,
  onProductSelect,
}: CommerceAISearchProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [lastSearchMode, setLastSearchMode] = useState<SearchMode>(null);

  const {
    query,
    setQuery,
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
  } = useCommerceAISearch({ apiBaseUrl, catalogLocale, queryLocale, locale });

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

  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      setLastSearchMode("text");
      voice.clearAudioSummary();
      void search(query);
    },
    [query, search, voice],
  );

  const handleQueryChange = useCallback(
    (value: string) => {
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

  const handleImageSelect = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) return;
      setLastSearchMode("image");
      voice.clearAudioSummary();
      void searchByImage(file);
    },
    [searchByImage, voice],
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
      aria-label="Product search"
    >
      {isDragging && enableImageSearch && (
        <div className="cat-drag-overlay" aria-hidden="true">
          Drop image to search
        </div>
      )}

      <form
        className={`cat-search-bar ${voice.isRecording ? "cat-search-bar--voice-active" : ""}`}
        onSubmit={handleSubmit}
      >
        <Search size={18} aria-hidden="true" color="var(--cat-text-muted)" />
        <input
          type="search"
          className="cat-search-input"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder={placeholder}
          aria-label="Search query"
          autoComplete="off"
        />

        {enableVoice && (
          <button
            type="button"
            className={`cat-icon-btn ${voice.isRecording ? "cat-icon-btn--active" : ""}`}
            onClick={() => void voice.toggleRecording()}
            disabled={voice.isProcessing}
            aria-label={voice.isRecording ? "Stop recording" : "Voice search"}
            aria-pressed={voice.isRecording}
          >
            {voice.isRecording ? <Square size={16} /> : <Mic size={16} />}
          </button>
        )}

        {enableImageSearch && (
          <>
            <button
              type="button"
              className="cat-icon-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              aria-label="Search by image"
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
            aria-label="Replay voice result summary"
          >
            <Volume2 size={16} />
          </button>
        )}
      </form>

      {showVoiceBanner && (
        <VoiceStatusBanner
          isRecording={voice.isRecording}
          isProcessing={voice.isProcessing}
          isLoadingTts={voice.isLoadingTts}
          error={voice.error}
          durationSeconds={recordingDuration}
        />
      )}

      {showResults && (
        <div className="cat-results" role="listbox" aria-label="Search results">
          {isLoading && <div className="cat-status">Searching...</div>}
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
                <div className="cat-status__title">No products found</div>
                {meta?.queryInterpretation && (
                  <div className="cat-status__hint">
                    Searched for: {meta.queryInterpretation}
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
