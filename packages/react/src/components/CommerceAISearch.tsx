import { useCallback, useMemo, useRef, useState } from "react";
import {
  Camera,
  Check,
  ImageIcon,
  Mic,
  Package,
  Search,
  SearchX,
  ShoppingCart,
  Square,
  Volume2,
} from "lucide-react";
import type {
  CartSnapshot,
  CommerceAISearchMessages,
  ProductCard,
  ThemeMode,
} from "@commerce-ai-tool/core";
import { resolveCommerceAISearchMessages, looksLikeCompoundShoppingList } from "@commerce-ai-tool/core";
import { useCommerceAISearch } from "../hooks/useCommerceAISearch.js";
import { useCameraCapture } from "../hooks/useCameraCapture.js";
import { useCart } from "../hooks/useCart.js";
import { useRecordingDuration } from "../hooks/useRecordingDuration.js";
import { useVoiceSearch } from "../hooks/useVoiceSearch.js";
import { ICON_STROKE } from "../icons.js";
import { CameraCaptureOverlay } from "./CameraCaptureOverlay.js";
import { CartPanel } from "./CartPanel.js";
import { MissionResults } from "./MissionResults.js";
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
  /** Show microphone search controls. Default true. */
  enableVoice?: boolean;
  /** Show local image upload and drag-and-drop search controls. Default true. */
  enableImageSearch?: boolean;
  /** Show camera capture search controls independently of image upload. Default true. */
  enableCameraSearch?: boolean;
  cameraFacingMode?: CameraFacingMode;
  enableTts?: boolean;
  /** Enable built-in add-to-cart buttons and cart preview panel. Default false. */
  enableCart?: boolean;
  /** Enable multi-item shopping missions on text, voice, and image search. Default false. */
  enableMissions?: boolean;
  /** Currency for cart creation. Required when `enableCart` is true unless the server has a default. */
  currency?: string;
  /** Optional ISO country code used for commercetools price selection. */
  country?: string;
  className?: string;
  onProductSelect?: (product: ProductCard) => void;
  /** Fires after every cart fetch or mutation when `enableCart` is true. */
  onCartChange?: (cart: CartSnapshot | null) => void;
  /** Opens the host-owned checkout route for the current non-empty cart. */
  onCheckout?: (cart: CartSnapshot) => void;
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
  enableCart = false,
  enableMissions = false,
  currency,
  country,
  className,
  onProductSelect,
  onCartChange,
  onCheckout,
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
    mission,
    isLoading,
    hasSearched,
    setHasSearched,
    error,
    meta,
    search,
    searchByImage,
    setError,
    setIsLoading,
    facets = [],
    suggestedFacets = [],
    hasFacetSession = false,
    refineFilters = async () => undefined,
    refine = async () => undefined,
    startNewSearch = async () => undefined,
    applySearchResult = () => undefined,
  } = useCommerceAISearch({
    apiBaseUrl,
    catalogLocale,
    queryLocale,
    locale,
    enableAutocomplete,
    enableFacets,
    persistSession,
    enableMissions,
  });

  const voice = useVoiceSearch({
    apiBaseUrl,
    catalogLocale,
    queryLocale,
    locale,
    enableTts,
    enableMissions,
    onResults: (products, resultMeta, extras) => {
      setLastSearchMode("voice");
      applySearchResult({
        products,
        meta: resultMeta,
        mission: extras?.mission,
      });
      setError(null);
      setIsLoading(false);
      setHasSearched(true);
    },
    onTranscript: (transcript) => setQuery(transcript, { search: false }),
  });

  const recordingDuration = useRecordingDuration(voice.isRecording);
  const showVoiceBanner =
    enableVoice &&
    (voice.isRecording || voice.isProcessing || voice.isLoadingTts || Boolean(voice.error));

  const cart = useCart({
    apiBaseUrl,
    currency,
    country,
    catalogLocale,
    enabled: enableCart,
    onCartChange,
  });
  const cartQuantity = cart.cart?.totalQuantity ?? 0;
  const cartBadgeLabel = cartQuantity > 99 ? "99+" : String(cartQuantity);
  const [addedProductIds, setAddedProductIds] = useState<Record<string, true>>({});

  const handleAddToCart = useCallback(
    async (product: ProductCard) => {
      if (!product.sku && !product.id) {
        return;
      }
      const next = await cart.addToCart(
        product.sku
          ? { sku: product.sku }
          : { productId: product.id, variantId: product.variantId },
      );
      if (!next) {
        return;
      }
      setAddedProductIds((current) => ({ ...current, [product.id]: true }));
      window.setTimeout(() => {
        setAddedProductIds((current) => {
          const nextAdded = { ...current };
          delete nextAdded[product.id];
          return nextAdded;
        });
      }, 1200);
    },
    [cart.addToCart],
  );

  const displayResults = results;
  const showMission = Boolean(mission);
  const showEmptyResults =
    !isLoading &&
    !error &&
    hasSearched &&
    displayResults.length === 0 &&
    !showMission &&
    query.trim().length > 0;
  const showResults =
    query.trim().length > 0 &&
    (isLoading ||
      !!error ||
      displayResults.length > 0 ||
      showEmptyResults ||
      showMission);
  const showSuggestions =
    enableAutocomplete &&
    !suggestionsDismissed &&
    !showResults &&
    query.trim().length >= 2 &&
    (isLoadingSuggestions || suggestions.length > 0 || !!suggestionsError || suggestionsReady);

  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      setLastSearchMode("text");
      voice.clearAudioSummary();
      setActiveSuggestionIndex(-1);

      if (enableAutocomplete && activeSuggestionIndex >= 0 && suggestions[activeSuggestionIndex]) {
        selectSuggestion(suggestions[activeSuggestionIndex]!);
        return;
      }

      if (
        enableFacets &&
        hasFacetSession &&
        !(enableMissions && looksLikeCompoundShoppingList(query))
      ) {
        void refine(query);
      } else {
        void search(query);
      }
    },
    [
      activeSuggestionIndex,
      enableAutocomplete,
      enableFacets,
      enableMissions,
      hasFacetSession,
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
        setActiveSuggestionIndex((current) => (current < suggestions.length - 1 ? current + 1 : 0));
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveSuggestionIndex((current) => (current > 0 ? current - 1 : suggestions.length - 1));
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
      if (!enableImageSearch) {
        return;
      }
      const file = event.dataTransfer.files[0];
      if (file) handleImageSelect(file);
    },
    [enableImageSearch, handleImageSelect],
  );

  const showVoiceReplay =
    enableVoice && enableTts && lastSearchMode === "voice" && Boolean(voice.audioSummary);

  return (
    <div
      className={[
        "cat-root",
        "cat-wrapper",
        showMission && !isLoading && !error ? "cat-root--mission" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-theme={theme}
      onDragOver={(e) => {
        if (!enableImageSearch) {
          return;
        }
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

      <div className="cat-search-shell">
      <form
        className={`cat-search-bar ${voice.isRecording ? "cat-search-bar--voice-active" : ""}`}
        onSubmit={handleSubmit}
      >
        <Search size={18} strokeWidth={ICON_STROKE} aria-hidden="true" color="var(--cat-text-muted)" />
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

        <div className="cat-search-actions">
        {enableVoice && (
          <button
            type="button"
            className={`cat-icon-btn ${voice.isRecording ? "cat-icon-btn--active" : ""}`}
            onClick={() => void voice.toggleRecording()}
            disabled={voice.isProcessing}
            aria-label={voice.isRecording ? messages.stopRecording : messages.voiceSearch}
            aria-pressed={voice.isRecording}
          >
            {voice.isRecording ? (
              <Square size={16} strokeWidth={ICON_STROKE} />
            ) : (
              <Mic size={16} strokeWidth={ICON_STROKE} />
            )}
          </button>
        )}

        {enableCameraSearch ? (
          <>
            <button
              type="button"
              className="cat-icon-btn"
              onClick={() => camera.open(cameraInputRef)}
              disabled={isLoading}
              aria-label={messages.searchByCamera}
            >
              <Camera size={16} strokeWidth={ICON_STROKE} />
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
        ) : null}

        {enableImageSearch ? (
          <>
            <button
              type="button"
              className="cat-icon-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              aria-label={messages.searchByImage}
            >
              <ImageIcon size={16} strokeWidth={ICON_STROKE} />
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
        ) : null}

        {showVoiceReplay && (
          <button
            type="button"
            className="cat-icon-btn"
            onClick={() => voice.replayAudioSummary()}
            aria-label={messages.replayVoiceSummary}
          >
            <Volume2 size={16} strokeWidth={ICON_STROKE} />
          </button>
        )}
        </div>

        {enableCart && (
          <button
            type="button"
            className={`cat-icon-btn cat-cart-toggle ${cart.isCartOpen ? "cat-cart-toggle--open" : ""}`}
            onClick={cart.toggleCart}
            aria-label={
              cartQuantity > 0
                ? `${messages.cartAriaLabel} (${cartBadgeLabel})`
                : messages.cartAriaLabel
            }
            aria-expanded={cart.isCartOpen}
            aria-pressed={cart.isCartOpen}
          >
            <ShoppingCart size={16} strokeWidth={ICON_STROKE} />
            {cartQuantity > 0 && (
              <span className="cat-cart-badge" aria-hidden="true">
                {cartBadgeLabel}
              </span>
            )}
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
      </div>

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

      {enableFacets && lastSearchMode === "text" && hasSearched && !showMission && (
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

      {showResults && isLoading && <div className="cat-status">{messages.searching}</div>}
      {showResults && error && <div className="cat-status cat-status--error">{error}</div>}

      {!isLoading && !error && showResults && showMission && mission ? (
        <MissionResults
          mission={mission}
          messages={messages}
          enableCart={enableCart}
          isMutating={cart.isMutating}
          addedProductIds={addedProductIds}
          onProductSelect={onProductSelect}
          onAddItem={(product) => void handleAddToCart(product)}
          onAddAll={(items) => cart.addItems(items)}
        />
      ) : null}

      {showResults && !showMission && !isLoading && !error && (
        <div
          className="cat-results"
          role={!isLoading && displayResults.length > 0 ? "list" : undefined}
          aria-label={
            !isLoading && displayResults.length > 0
              ? messages.searchResultsAriaLabel
              : undefined
          }
        >
          {!isLoading &&
            displayResults.map((product, index) => {
              const canAdd = Boolean(product.sku || product.id);
              const justAdded = Boolean(addedProductIds[product.id]);
              const productBody = (
                <>
                  {product.imageUrl ? (
                    <img
                      src={product.imageUrl}
                      alt=""
                      className="cat-result-image"
                      loading="lazy"
                    />
                  ) : (
                    <div className="cat-result-image cat-result-image--placeholder">
                      <Package size={20} strokeWidth={ICON_STROKE} color="var(--cat-text-muted)" />
                    </div>
                  )}
                  <div className="cat-result-info">
                    <div className="cat-result-name">{product.name}</div>
                    {product.price && (
                      <div className="cat-result-price">{product.price.formatted}</div>
                    )}
                  </div>
                </>
              );

              return (
                <article
                  key={product.id}
                  className={`cat-result-card${index === 0 ? " cat-result-card--featured" : ""}`}
                  role="listitem"
                >
                  <div className="cat-result-card__core">
                    <button
                      type="button"
                      className="cat-result-card__select"
                      onClick={() => onProductSelect?.(product)}
                    >
                      {productBody}
                    </button>
                    {enableCart ? (
                      <button
                        type="button"
                        className={`cat-icon-btn cat-result-card__add ${justAdded ? "cat-result-card__add--added" : ""}`}
                        aria-label={
                          justAdded
                            ? messages.itemAdded
                            : canAdd
                              ? messages.addToCart
                              : messages.unableToAddToCart
                        }
                        disabled={!canAdd || cart.isMutating}
                        onClick={() => handleAddToCart(product)}
                      >
                        {justAdded ? (
                          <Check size={16} strokeWidth={ICON_STROKE} />
                        ) : (
                          <ShoppingCart size={16} strokeWidth={ICON_STROKE} />
                        )}
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}

          {!isLoading && !error && displayResults.length === 0 && showEmptyResults && (
            <div className="cat-status cat-status--empty" role="status" aria-live="polite">
              <SearchX size={18} strokeWidth={ICON_STROKE} aria-hidden="true" />
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

      {enableCart && cart.isCartOpen && (
        <CartPanel
          cart={cart.cart}
          customer={cart.customer}
          isLoading={cart.isLoading || cart.isMutating}
          isLoggingIn={cart.isLoggingIn}
          error={cart.error}
          messages={messages}
          catalogLocale={catalogLocale}
          onClose={cart.closeCart}
          onRemove={(lineItemId) => void cart.removeFromCart(lineItemId)}
          onQuantityChange={(lineItemId, quantity) =>
            void cart.updateQuantity(lineItemId, quantity)
          }
          onLogin={(input) => void cart.login(input)}
          onLogout={() => void cart.logout()}
          onCheckout={onCheckout}
        />
      )}
    </div>
  );
}
