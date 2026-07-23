import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewChild,
  ViewEncapsulation,
  inject,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import type {
  CommerceAISearchMessages,
  InterpretedSearchFilters,
  ProductCard,
  SearchFacetGroup,
  SuggestedFacet,
  ThemeMode,
} from "@commerce-ai-tool/core";
import { resolveCommerceAISearchMessages, isFacetFilterSelected, toggleFacetFilter } from "@commerce-ai-tool/core";
import { CommerceAiApiService } from "./commerce-ai-api.service.js";
import {
  buildCameraConstraints,
  createJpegFileFromVideo,
  getCameraErrorMessage,
  prefersNativeCamera,
  stopMediaStream,
  type CameraFacingMode,
} from "./camera.util.js";

type SearchMode = "text" | "image" | "voice" | null;

@Component({
  selector: "commerce-ai-search",
  standalone: true,
  imports: [FormsModule],
  template: `
    <div
      class="cat-root cat-wrapper"
      [attr.data-theme]="theme"
      role="search"
      [attr.aria-label]="resolvedMessages.productSearchAriaLabel"
      (dragover)="onDragOver($event)"
      (dragleave)="isDragging = false"
      (drop)="onDrop($event)"
    >
      @if (isDragging && enableImageSearch) {
        <div class="cat-drag-overlay" aria-hidden="true">{{ resolvedMessages.dropImageToSearch }}</div>
      }

      <form class="cat-search-bar" (ngSubmit)="onSubmit()">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>

        <div class="cat-search-input-wrap">
          <input
            type="search"
            class="cat-search-input"
            [(ngModel)]="query"
            name="query"
            [placeholder]="resolvedMessages.placeholder"
            [attr.aria-label]="resolvedMessages.searchAriaLabel"
            [attr.role]="enableAutocomplete ? 'combobox' : null"
            [attr.aria-haspopup]="enableAutocomplete ? 'listbox' : null"
            [attr.aria-autocomplete]="enableAutocomplete ? 'list' : null"
            [attr.aria-expanded]="showSuggestions"
            [attr.aria-controls]="showSuggestions ? 'cat-suggestions-listbox' : null"
            [attr.aria-activedescendant]="activeSuggestionId"
            autocomplete="off"
            (ngModelChange)="onQueryChange($event)"
            (keydown)="onInputKeyDown($event)"
          />
        </div>

        @if (enableVoice) {
          <button
            type="button"
            class="cat-icon-btn"
            [class.cat-icon-btn--active]="isRecording"
            [disabled]="isProcessing"
            [attr.aria-label]="isRecording ? resolvedMessages.stopRecording : resolvedMessages.voiceSearch"
            [attr.aria-pressed]="isRecording"
            (click)="toggleRecording()"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </svg>
          </button>
        }

        @if (enableImageSearch) {
          @if (enableCameraSearch) {
            <button
              type="button"
              class="cat-icon-btn"
              [disabled]="isLoading"
              aria-label="{{ resolvedMessages.searchByCamera }}"
              (click)="openCamera()"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                <circle cx="12" cy="13" r="3" />
              </svg>
            </button>
            <input
              #cameraInput
              type="file"
              accept="image/*"
              [attr.capture]="cameraFacingMode"
              class="cat-hidden-input"
              (change)="onCameraFileSelected($event)"
            />
          }
          <button
            type="button"
            class="cat-icon-btn"
            [disabled]="isLoading"
            aria-label="{{ resolvedMessages.searchByImage }}"
            (click)="fileInput.click()"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
              <circle cx="9" cy="9" r="2" />
              <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
            </svg>
          </button>
          <input
            #fileInput
            type="file"
            accept="image/*"
            class="cat-hidden-input"
            (change)="onFileSelected($event)"
          />
        }

        @if (showVoiceReplay) {
          <button
            type="button"
            class="cat-icon-btn"
            aria-label="{{ resolvedMessages.replayVoiceSummary }}"
            (click)="replayVoiceSummary()"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
          </button>
        }

        @if (showSuggestions) {
          <div
            id="cat-suggestions-listbox"
            class="cat-suggestions"
            role="listbox"
            [attr.aria-label]="resolvedMessages.suggestionsAriaLabel"
          >
            @if (isLoadingSuggestions && suggestions.length === 0 && !suggestionsError) {
              <div class="cat-suggestions__status">{{ resolvedMessages.loadingSuggestions }}</div>
            }

            @if (suggestionsError) {
              <div class="cat-suggestions__status cat-suggestions__status--error" role="alert">
                {{ suggestionsError }}
              </div>
            }

            @if (
              !isLoadingSuggestions &&
              !suggestionsError &&
              suggestionsReady &&
              suggestions.length === 0
            ) {
              <div class="cat-suggestions__status">{{ resolvedMessages.noSuggestions }}</div>
            }

            @for (suggestion of suggestions; track $index; let index = $index) {
              <button
                type="button"
                class="cat-suggestions__item"
                [class.cat-suggestions__item--active]="index === activeSuggestionIndex"
                role="option"
                [attr.id]="'cat-suggestion-' + index"
                [attr.aria-selected]="index === activeSuggestionIndex"
                (mousedown)="$event.preventDefault()"
                (click)="onSuggestionSelect(suggestion)"
              >
                {{ suggestion }}
              </button>
            }
          </div>
        }
      </form>

      @if (enableCameraSearch && (isCameraOpen || cameraError)) {
        <div class="cat-camera-overlay" role="dialog" [attr.aria-label]="resolvedMessages.cameraCapture">
          <div class="cat-camera-overlay__panel">
            @if (cameraError) {
              <div class="cat-camera-overlay__error" role="alert">
                <p>{{ cameraError }}</p>
                <button type="button" class="cat-camera-overlay__btn" (click)="clearCameraError()">
                  {{ resolvedMessages.dismiss }}
                </button>
              </div>
            } @else {
              <video
                #cameraVideo
                class="cat-camera-preview"
                autoplay
                playsinline
                muted
                [attr.aria-label]="resolvedMessages.cameraPreview"
              ></video>
              <div class="cat-camera-actions">
                <button
                  type="button"
                  class="cat-camera-overlay__btn cat-camera-overlay__btn--secondary"
                  [attr.aria-label]="resolvedMessages.cancel"
                  (click)="closeCamera()"
                >
                  {{ resolvedMessages.cancel }}
                </button>
                <button
                  type="button"
                  class="cat-camera-overlay__btn cat-camera-overlay__btn--primary"
                  [attr.aria-label]="resolvedMessages.capturePhoto"
                  (click)="capturePhoto()"
                >
                  {{ resolvedMessages.capturePhoto }}
                </button>
              </div>
            }
          </div>
        </div>
      }

      @if (enableFacets && lastSearchMode === "text" && hasSearched && facets.length) {
        <section class="cat-facets" [attr.aria-label]="resolvedMessages.filtersAriaLabel">
          <div class="cat-facets__header">
            <span>{{ resolvedMessages.narrowResults }}</span>
            <div class="cat-facets__actions">
              @if (hasAppliedFilters) {
                <button type="button" class="cat-facets__clear" (click)="clearFacetFilters()">
                  {{ resolvedMessages.clearFilters }}
                </button>
              }
              <button type="button" class="cat-facets__clear" (click)="startNewSearch()">
                {{ resolvedMessages.newSearch }}
              </button>
            </div>
          </div>
          @for (facet of facets; track facet.id) {
            <div class="cat-facet-group" role="group" [attr.aria-label]="facet.label">
              <span class="cat-facet-group__label">{{ facet.label }}</span>
              <div class="cat-facet-group__options">
                @for (bucket of facet.buckets; track bucket.key) {
                  <button
                    type="button"
                    class="cat-facet-chip"
                    [class.cat-facet-chip--selected]="isFacetSelected(facet.id, bucket.key)"
                    [attr.aria-pressed]="isFacetSelected(facet.id, bucket.key)"
                    (click)="toggleFacet(facet.id, bucket.key)"
                  >
                    {{ bucket.label }} {{ bucket.count }}
                  </button>
                }
              </div>
            </div>
          }
        </section>
      }

      @if (showResults) {
        <div class="cat-results" role="listbox" [attr.aria-label]="resolvedMessages.searchResultsAriaLabel">
          @if (isLoading) {
            <div class="cat-status">{{ resolvedMessages.searching }}</div>
          }
          @if (error) {
            <div class="cat-status cat-status--error">{{ error }}</div>
          }

          @for (product of results; track product.id) {
            <button
              type="button"
              class="cat-result-item"
              role="option"
              (click)="productSelect.emit(product)"
            >
              @if (product.imageUrl) {
                <img [src]="product.imageUrl" alt="" class="cat-result-image" loading="lazy" />
              } @else {
                <div class="cat-result-image cat-result-image--placeholder">📦</div>
              }
              <div class="cat-result-info">
                <div class="cat-result-name">{{ product.name }}</div>
                @if (product.price) {
                  <div class="cat-result-price">{{ product.price.formatted }}</div>
                }
              </div>
            </button>
          }

          @if (!isLoading && !error && results.length === 0 && hasSearched && query.trim()) {
            <div class="cat-status cat-status--empty" role="status" aria-live="polite">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
                <path d="m13 9-4 4" />
                <path d="m9 9 4 4" />
              </svg>
              <div class="cat-status__content">
                <div class="cat-status__title">{{ resolvedMessages.noProductsFound }}</div>
                @if (meta?.queryInterpretation) {
                  <div class="cat-status__hint">
                    {{ resolvedMessages.searchedFor }} {{ meta?.queryInterpretation }}
                  </div>
                }
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
  encapsulation: ViewEncapsulation.None,
})
export class CommerceAiSearchComponent {
  private readonly api = inject(CommerceAiApiService);
  private readonly cdr = inject(ChangeDetectorRef);

  @Input() apiBaseUrl = "/api/commerce-ai";
  @Input() theme: ThemeMode = "auto";
  @Input() catalogLocale?: string;
  @Input() queryLocale?: string;
  /** @deprecated Use queryLocale */
  @Input() locale?: string;
  @Input() placeholder = "What are you looking for?";
  @Input() messages?: Partial<CommerceAISearchMessages>;
  @Input() enableAutocomplete = false;
  @Input() enableFacets = false;
  @Input() enableVoice = true;
  @Input() enableImageSearch = true;
  @Input() enableCameraSearch = true;
  @Input() cameraFacingMode: CameraFacingMode = "environment";
  @Input() enableTts = true;

  @Output() productSelect = new EventEmitter<ProductCard>();

  @ViewChild("cameraInput") cameraInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild("cameraVideo") cameraVideoRef?: ElementRef<HTMLVideoElement>;

  query = "";
  suggestions: string[] = [];
  activeSuggestionIndex = -1;
  isLoadingSuggestions = false;
  suggestionsError: string | null = null;
  suggestionsReady = false;
  suggestionsDismissed = false;
  results: ProductCard[] = [];
  meta: {
    queryInterpretation?: string;
    searchTerms?: string[];
    appliedFilters?: InterpretedSearchFilters;
  } | null = null;
  facets: SearchFacetGroup[] = [];
  suggestedFacets: SuggestedFacet[] = [];
  isLoading = false;
  hasSearched = false;
  error: string | null = null;
  isDragging = false;
  isRecording = false;
  isProcessing = false;
  isCameraOpen = false;
  cameraError: string | null = null;
  lastSearchMode: SearchMode = null;
  audioSummary: string | null = null;

  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private cameraStream: MediaStream | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private suggestionsTimer: ReturnType<typeof setTimeout> | null = null;
  private searchAbort: AbortController | null = null;
  private suggestionsAbort: AbortController | null = null;
  private searchRequestId = 0;
  private suggestionsRequestId = 0;

  get resolvedMessages(): CommerceAISearchMessages {
    return resolveCommerceAISearchMessages({
      ...this.messages,
      placeholder: this.messages?.placeholder ?? this.placeholder,
    });
  }

  get showSuggestions(): boolean {
    return (
      this.enableAutocomplete &&
      !this.suggestionsDismissed &&
      !this.showResults &&
      this.query.trim().length >= 2 &&
      (this.isLoadingSuggestions ||
        this.suggestions.length > 0 ||
        !!this.suggestionsError ||
        this.suggestionsReady)
    );
  }

  get activeSuggestionId(): string | null {
    return this.activeSuggestionIndex >= 0
      ? `cat-suggestion-${this.activeSuggestionIndex}`
      : null;
  }

  get showResults(): boolean {
    const hasQuery = this.query.trim().length > 0;
    const showEmptyResults =
      !this.isLoading && !this.error && this.hasSearched && this.results.length === 0 && hasQuery;

    return (
      hasQuery &&
      (this.results.length > 0 || this.isLoading || !!this.error || showEmptyResults)
    );
  }

  get showVoiceReplay(): boolean {
    return this.enableTts && this.lastSearchMode === "voice" && !!this.audioSummary;
  }

  onQueryChange(value: string): void {
    this.activeSuggestionIndex = -1;
    this.suggestionsDismissed = false;

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.suggestionsTimer) {
      clearTimeout(this.suggestionsTimer);
      this.suggestionsTimer = null;
    }

    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed.length < 2) {
      this.lastSearchMode = null;
      this.clearVoiceAudio();
      this.clearResults();
      return;
    }

    this.lastSearchMode = "text";
    this.clearVoiceAudio();

    if (this.enableAutocomplete) {
      this.isLoadingSuggestions = true;
      this.suggestionsTimer = setTimeout(() => this.fetchSuggestions(trimmed), 200);
      return;
    }

    this.isLoading = true;
    this.error = null;
    this.results = [];
    this.meta = null;
    this.debounceTimer = setTimeout(() => this.onSubmit(), 250);
  }

  onSuggestionSelect(suggestion: string): void {
    this.activeSuggestionIndex = -1;
    this.query = suggestion;
    this.suggestions = [];
    this.onSubmit();
  }

  onInputKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      this.activeSuggestionIndex = -1;
      this.suggestionsDismissed = true;
      return;
    }

    if (!this.showSuggestions || this.suggestions.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      this.activeSuggestionIndex =
        this.activeSuggestionIndex < this.suggestions.length - 1
          ? this.activeSuggestionIndex + 1
          : 0;
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      this.activeSuggestionIndex =
        this.activeSuggestionIndex > 0
          ? this.activeSuggestionIndex - 1
          : this.suggestions.length - 1;
      return;
    }

    if (event.key === "Enter" && this.activeSuggestionIndex >= 0) {
      event.preventDefault();
      const suggestion = this.suggestions[this.activeSuggestionIndex];
      if (suggestion) {
        this.onSuggestionSelect(suggestion);
      }
    }
  }

  private fetchSuggestions(searchQuery: string): void {
    this.suggestionsAbort?.abort();
    const controller = new AbortController();
    this.suggestionsAbort = controller;
    const requestId = ++this.suggestionsRequestId;

    this.isLoadingSuggestions = true;
    this.suggestionsError = null;
    this.suggestionsReady = false;

    void this.api
      .suggest(this.apiBaseUrl, searchQuery, this.localeFields, controller.signal)
      .then((data) => {
        if (requestId !== this.suggestionsRequestId) return;
        this.suggestions = data.suggestions;
        this.isLoadingSuggestions = false;
        this.suggestionsReady = true;
        this.cdr.detectChanges();
      })
      .catch((err: Error) => {
        if (err.name === "AbortError") return;
        if (requestId !== this.suggestionsRequestId) return;
        this.suggestions = [];
        this.suggestionsError = err.message || "Suggestions failed";
        this.isLoadingSuggestions = false;
        this.suggestionsReady = true;
        this.cdr.detectChanges();
      });
  }

  private clearResults(): void {
    this.searchAbort?.abort();
    this.searchAbort = null;
    this.suggestionsAbort?.abort();
    this.suggestionsAbort = null;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.suggestionsTimer) {
      clearTimeout(this.suggestionsTimer);
      this.suggestionsTimer = null;
    }
    this.results = [];
    this.meta = null;
    this.error = null;
    this.isLoading = false;
    this.hasSearched = false;
    this.suggestions = [];
    this.isLoadingSuggestions = false;
    this.suggestionsError = null;
    this.suggestionsReady = false;
    this.suggestionsDismissed = false;
    this.activeSuggestionIndex = -1;
  }

  private get localeFields() {
    return {
      catalogLocale: this.catalogLocale,
      queryLocale: this.queryLocale,
      locale: this.locale,
    };
  }

  isFacetSelected(facetId: string, key: string): boolean {
    return isFacetFilterSelected(this.meta?.appliedFilters ?? {}, facetId, key);
  }

  get hasAppliedFilters(): boolean {
    return Object.keys(this.meta?.appliedFilters ?? {}).length > 0;
  }

  toggleFacet(facetId: string, key: string): void {
    if (!this.meta?.searchTerms) return;
    const filters = toggleFacetFilter(this.meta.appliedFilters ?? {}, facetId, key);
    this.searchWithFacets(filters);
  }

  clearFacetFilters(): void {
    if (!this.meta?.searchTerms) return;
    this.searchWithFacets({});
  }

  startNewSearch(): void {
    const q = this.query.trim();
    if (!q) return;
    this.suggestedFacets = [];
    this.meta = this.meta
      ? { ...this.meta, searchTerms: undefined, appliedFilters: undefined }
      : null;
    this.lastSearchMode = "text";
    this.clearVoiceAudio();
    this.suggestions = [];
    this.activeSuggestionIndex = -1;

    this.searchAbort?.abort();
    const controller = new AbortController();
    this.searchAbort = controller;
    const requestId = ++this.searchRequestId;

    this.isLoading = true;
    this.error = null;
    this.results = [];

    void this.api
      .search(this.apiBaseUrl, q, this.localeFields, controller.signal, {
        includeFacets: this.enableFacets,
      })
      .then((data) => {
        if (requestId !== this.searchRequestId) return;
        this.results = data.products;
        this.meta = data.meta;
        this.facets = data.facets ?? [];
        this.suggestedFacets = data.suggestedFacets ?? [];
        this.isLoading = false;
        this.hasSearched = true;
        this.cdr.detectChanges();
      })
      .catch((err: Error) => {
        if (err.name === "AbortError") return;
        if (requestId !== this.searchRequestId) return;
        this.error = err.message;
        this.results = [];
        this.meta = null;
        this.isLoading = false;
        this.hasSearched = true;
        this.cdr.detectChanges();
      });
  }

  private searchWithFacets(filters: InterpretedSearchFilters, refineQuery?: string): void {
    if (!this.meta?.searchTerms) return;
    this.isLoading = true;
    this.error = null;
    const controller = new AbortController();
    this.searchAbort?.abort();
    this.searchAbort = controller;
    const requestId = ++this.searchRequestId;

    void this.api
      .search(this.apiBaseUrl, this.meta.queryInterpretation ?? this.query, this.localeFields, controller.signal, {
        filters,
        searchTerms: this.meta.searchTerms,
        refineQuery,
        suggestedFacets: this.suggestedFacets,
        includeFacets: true,
      })
      .then((data) => {
        if (requestId !== this.searchRequestId) return;
        this.results = data.products;
        this.meta = data.meta;
        this.facets = data.facets ?? [];
        this.suggestedFacets = data.suggestedFacets ?? [];
        this.isLoading = false;
        this.hasSearched = true;
        this.cdr.detectChanges();
      })
      .catch((error: Error) => {
        if (requestId !== this.searchRequestId || error.name === "AbortError") return;
        this.error = error.message;
        this.isLoading = false;
        this.cdr.detectChanges();
      });
  }

  onSubmit(): void {
    const q = this.query.trim();
    if (!q) return;

    if (
      this.enableAutocomplete &&
      this.activeSuggestionIndex >= 0 &&
      this.suggestions[this.activeSuggestionIndex]
    ) {
      this.onSuggestionSelect(this.suggestions[this.activeSuggestionIndex]!);
      return;
    }

    this.lastSearchMode = "text";
    this.clearVoiceAudio();
    this.suggestions = [];
    this.activeSuggestionIndex = -1;

    this.searchAbort?.abort();
    const controller = new AbortController();
    this.searchAbort = controller;
    const requestId = ++this.searchRequestId;

    this.isLoading = true;
    this.error = null;
    this.results = [];
    const previousMeta = this.meta;
    this.meta = null;

    const isRefinement = this.enableFacets && Boolean(previousMeta?.searchTerms);
    void this.api.search(
      this.apiBaseUrl,
      isRefinement ? previousMeta?.queryInterpretation ?? q : q,
      this.localeFields,
      controller.signal,
      isRefinement
        ? {
            searchTerms: previousMeta?.searchTerms,
            filters: previousMeta?.appliedFilters,
            refineQuery: q,
            suggestedFacets: this.suggestedFacets,
            includeFacets: true,
          }
        : { includeFacets: this.enableFacets },
    ).then(
      (data) => {
        if (requestId !== this.searchRequestId) return;
        this.results = data.products;
        this.meta = data.meta;
        this.facets = data.facets ?? [];
        this.suggestedFacets = data.suggestedFacets ?? [];
        this.isLoading = false;
        this.hasSearched = true;
      },
      (err: Error) => {
        if (err.name === "AbortError") return;
        if (requestId !== this.searchRequestId) return;
        this.error = err.message;
        this.results = [];
        this.meta = null;
        this.isLoading = false;
        this.hasSearched = true;
      },
    );
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) void this.searchByImage(file);
  }

  onCameraFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (file) void this.searchByImage(file);
  }

  openCamera(): void {
    this.cameraError = null;

    if (prefersNativeCamera()) {
      this.cameraInputRef?.nativeElement.click();
      return;
    }

    void this.openCameraOverlay();
  }

  async openCameraOverlay(): Promise<void> {
    this.cameraError = null;

    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        buildCameraConstraints(this.cameraFacingMode),
      );
      this.cameraStream = stream;
      this.isCameraOpen = true;
      this.cdr.detectChanges();

      const video = this.cameraVideoRef?.nativeElement;
      if (video) {
        video.srcObject = stream;
        await video.play();
      }
    } catch (err) {
      this.cameraError = getCameraErrorMessage(err);
      this.closeCamera();
    }
  }

  async capturePhoto(): Promise<void> {
    const video = this.cameraVideoRef?.nativeElement;
    if (!video) return;

    try {
      const file = await createJpegFileFromVideo(video);
      this.closeCamera();
      void this.searchByImage(file);
    } catch (err) {
      this.closeCamera();
      this.error = err instanceof Error ? err.message : this.resolvedMessages.couldNotCapturePhoto;
    }
  }

  closeCamera(): void {
    stopMediaStream(this.cameraStream);
    this.cameraStream = null;
    this.isCameraOpen = false;

    const video = this.cameraVideoRef?.nativeElement;
    if (video) {
      video.srcObject = null;
    }
  }

  clearCameraError(): void {
    this.cameraError = null;
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = true;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = false;
    const file = event.dataTransfer?.files[0];
    if (file) void this.searchByImage(file);
  }

  searchByImage(file: File): void {
    if (!file.type.startsWith("image/")) return;

    this.lastSearchMode = "image";
    this.clearVoiceAudio();

    this.searchAbort?.abort();
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    this.isLoading = true;
    this.error = null;
    this.results = [];
    this.meta = null;

    void this.api.searchByImage(this.apiBaseUrl, file, this.localeFields).then(
      (data) => {
        this.results = data.products;
        this.meta = data.meta;
        if (data.interpretation) this.query = data.interpretation;
        this.isLoading = false;
        this.hasSearched = true;
      },
      (err: Error) => {
        this.error = err.message;
        this.isLoading = false;
        this.hasSearched = true;
      },
    );
  }

  async toggleRecording(): Promise<void> {
    if (this.isRecording) {
      this.mediaRecorder?.stop();
      this.isRecording = false;
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream);
      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.audioChunks.push(e.data);
      };

      this.mediaRecorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(this.audioChunks, { type: "audio/webm" });
        this.isProcessing = true;
        this.clearVoiceAudio();

        void this.api
          .searchByVoice(this.apiBaseUrl, blob, this.localeFields, this.enableTts)
          .then(async (data) => {
            this.lastSearchMode = "voice";
            this.query = data.transcript;
            this.results = data.products;
            this.meta = data.meta;
            this.error = null;
            this.hasSearched = true;
            if (data.audioSummary) {
              this.audioSummary = data.audioSummary;
              const audio = new Audio(`data:audio/mpeg;base64,${data.audioSummary}`);
              void audio.play();
            } else if (this.enableTts && data.ttsText && data.ttsPending) {
              try {
                const blob = await this.api.synthesizeSpeech(this.apiBaseUrl, data.ttsText);
                const buffer = await blob.arrayBuffer();
                const bytes = new Uint8Array(buffer);
                let binary = "";
                for (let i = 0; i < bytes.length; i++) {
                  binary += String.fromCharCode(bytes[i]!);
                }
                this.audioSummary = btoa(binary);
                const audio = new Audio(`data:audio/mpeg;base64,${this.audioSummary}`);
                void audio.play();
              } catch {
                this.audioSummary = null;
              }
            }
          })
          .catch((err: Error) => {
            this.error = err.message;
          })
          .finally(() => {
            this.isProcessing = false;
          });
      };

      this.mediaRecorder.start();
      this.isRecording = true;
    } catch {
      this.error = "Microphone access denied";
    }
  }

  replayVoiceSummary(): void {
    if (!this.audioSummary) return;

    const audio = new Audio(`data:audio/mpeg;base64,${this.audioSummary}`);
    void audio.play();
  }

  private clearVoiceAudio(): void {
    this.audioSummary = null;
  }
}
