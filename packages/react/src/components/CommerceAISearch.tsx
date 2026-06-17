import { useCallback, useRef, useState } from "react";
import { ImageIcon, Mic, Package, Search, Volume2 } from "lucide-react";
import type { ProductCard, ThemeMode } from "@commerce-ai-tool/core";
import { useCommerceAISearch } from "../hooks/useCommerceAISearch.js";
import { useVoiceSearch } from "../hooks/useVoiceSearch.js";
import "../styles/commerce-ai-search.css";

export interface CommerceAISearchProps {
  apiBaseUrl: string;
  theme?: ThemeMode;
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
  locale = "en",
  placeholder = "Search products...",
  enableVoice = true,
  enableImageSearch = true,
  enableTts = true,
  className,
  onProductSelect,
}: CommerceAISearchProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const {
    query,
    setQuery,
    results,
    meta,
    isLoading,
    error,
    search,
    searchByImage,
    setResults,
    setMeta,
    setError,
    setIsLoading,
  } = useCommerceAISearch({ apiBaseUrl, locale });

  const voice = useVoiceSearch({
    apiBaseUrl,
    locale,
    enableTts,
    onResults: (products, resultMeta) => {
      setResults(products);
      setMeta(resultMeta);
      setError(null);
      setIsLoading(false);
    },
    onTranscript: (transcript) => setQuery(transcript),
  });

  const displayResults = results;
  const showResults = displayResults.length > 0 || isLoading || error;

  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      void search();
    },
    [search],
  );

  const handleImageSelect = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) return;
      void searchByImage(file);
    },
    [searchByImage],
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

  const playTts = useCallback(async () => {
    if (!meta?.queryInterpretation) return;
    const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: meta.queryInterpretation }),
    });
    if (response.ok) {
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      void audio.play();
    }
  }, [apiBaseUrl, meta?.queryInterpretation]);

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

      <form className="cat-search-bar" onSubmit={handleSubmit}>
        <Search size={18} aria-hidden="true" color="var(--cat-text-muted)" />
        <input
          type="search"
          className="cat-search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
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
            <Mic size={16} />
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

        {enableTts && meta?.queryInterpretation && (
          <button
            type="button"
            className="cat-icon-btn"
            onClick={() => void playTts()}
            aria-label="Read interpretation aloud"
          >
            <Volume2 size={16} />
          </button>
        )}
      </form>

      {showResults && (
        <div className="cat-results" role="listbox" aria-label="Search results">
          {isLoading && <div className="cat-status">Searching...</div>}
          {error && <div className="cat-status cat-status--error">{error}</div>}
          {voice.error && <div className="cat-status cat-status--error">{voice.error}</div>}

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

          {!isLoading && !error && displayResults.length === 0 && query && (
            <div className="cat-status">No products found</div>
          )}
        </div>
      )}
    </div>
  );
}
