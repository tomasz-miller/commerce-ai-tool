import { Injectable, computed, inject, signal } from "@angular/core";
import type {
  CartSnapshot,
  AudioPlayer,
  CommerceAISearchMessages,
  InterpretedSearchFilters,
  MissionSearchResult,
  ProductCard,
  SearchFacetGroup,
  SearchResult,
  SuggestedFacet,
  ThemeMode,
} from "@commerce-ai-tool/core/client";
import {
  audioFromBase64,
  buildCameraConstraints,
  createAudioPlayer,
  createJpegFileFromVideo,
  getCameraErrorMessage,
  looksLikeCompoundShoppingList,
  messageForError,
  resolveCommerceAISearchMessages,
  searchAnnouncement,
  selectedFacetChips,
  stopMediaStream,
  toCartItem,
  toggleFacetFilter,
  trackChipGroups,
  type CameraFacingMode,
} from "@commerce-ai-tool/core/client";
import { CommerceAiApiService } from "../commerce-ai-api.service";
import { CommerceAiCartService } from "../commerce-ai-cart.service";
import {
  addToCartLabel,
  isAbortError,
  suggestionOptionId,
  type MessageKey,
  type SearchMetaView,
  type SearchMode,
} from "./search.model";

/** Gives every widget instance its own DOM id prefix, so two widgets on a page never collide. */
let nextInstanceId = 0;

/**
 * State and orchestration of one search widget: text, refinement, image and voice search, the
 * autocomplete, the facet chips, the camera and the microphone. Provided by the widget component
 * (one store per instance); the child components only receive slices of it through inputs.
 */
@Injectable()
export class CommerceAiSearchStore {
  private readonly api = inject(CommerceAiApiService);
  readonly cart = inject(CommerceAiCartService);
  /** Prefix of every DOM id this instance renders (listbox, options). */
  readonly uid = `cat-search-${++nextInstanceId}`;

  // Widget configuration: written by the component's inputs, read by the computed values below.
  readonly apiBaseUrl = signal("/api/commerce-ai");
  readonly catalogLocale = signal<string | undefined>(undefined);
  readonly queryLocale = signal<string | undefined>(undefined);
  readonly locale = signal<string | undefined>(undefined);
  readonly enableMissions = signal(false);
  readonly currency = signal<string | undefined>(undefined);
  readonly country = signal<string | undefined>(undefined);
  readonly theme = signal<ThemeMode>("auto");
  readonly placeholder = signal("What are you looking for?");
  readonly messages = signal<Partial<CommerceAISearchMessages> | undefined>(undefined);
  readonly enableAutocomplete = signal(false);
  readonly enableFacets = signal(false);
  readonly enableVoice = signal(true);
  readonly enableImageSearch = signal(true);
  readonly enableCameraSearch = signal(true);
  readonly cameraFacingMode = signal<CameraFacingMode>("environment");
  readonly enableTts = signal(true);
  readonly enableCart = signal(false);

  readonly query = signal("");
  readonly suggestions = signal<string[]>([]);
  readonly activeSuggestionIndex = signal(-1);
  readonly isLoadingSuggestions = signal(false);
  readonly suggestionsError = signal<string | null>(null);
  readonly suggestionsReady = signal(false);
  readonly suggestionsDismissed = signal(false);
  readonly results = signal<ProductCard[]>([]);
  readonly mission = signal<MissionSearchResult | null>(null);
  readonly hasFacetSession = signal(false);
  readonly addedProductIds = signal<Record<string, true>>({});
  readonly meta = signal<SearchMetaView | null>(null);
  readonly facets = signal<SearchFacetGroup[]>([]);
  readonly suggestedFacets = signal<SuggestedFacet[]>([]);
  readonly isLoading = signal(false);
  readonly hasSearched = signal(false);
  readonly error = signal<string | null>(null);
  readonly isDragging = signal(false);
  readonly isRecording = signal(false);
  readonly isProcessing = signal(false);
  readonly isLoadingTts = signal(false);
  readonly isCameraOpen = signal(false);
  readonly cameraError = signal<string | null>(null);
  readonly voiceError = signal<string | null>(null);
  readonly lastSearchMode = signal<SearchMode>(null);
  /** The spoken summary of the last voice search, kept for the replay button. */
  readonly audioClip = signal<Blob | null>(null);
  readonly recordingDuration = signal(0);

  readonly resolvedMessages = computed(() => {
    const messages = this.messages();
    return resolveCommerceAISearchMessages({
      ...messages,
      placeholder: messages?.placeholder ?? this.placeholder(),
    });
  });

  readonly showMission = computed(() => Boolean(this.mission()));
  readonly showMissionVisible = computed(
    () => this.showMission() && !this.isLoading() && !this.error(),
  );
  readonly missionLaneCount = computed(() => {
    if (!this.showMissionVisible()) {
      return 0;
    }
    return Math.min(Math.max(this.mission()?.intents.length ?? 1, 1), 5);
  });
  /** The mission to render: only once loading is done without an error. */
  readonly visibleMission = computed(() =>
    this.showResults() && !this.isLoading() && !this.error() ? this.mission() : null,
  );

  readonly showEmptyResults = computed(
    () =>
      !this.isLoading() &&
      !this.error() &&
      this.hasSearched() &&
      this.results().length === 0 &&
      !this.showMission() &&
      this.query().trim().length > 0,
  );

  /** An error shows even without a query text: an image search that fails starts from an empty box. */
  readonly showResults = computed(() => {
    const hasQuery = this.query().trim().length > 0;

    return (
      !!this.error() ||
      (hasQuery &&
        (this.results().length > 0 ||
          this.isLoading() ||
          this.showEmptyResults() ||
          this.showMission()))
    );
  });

  readonly showSuggestions = computed(
    () =>
      this.enableAutocomplete() &&
      !this.suggestionsDismissed() &&
      !this.showResults() &&
      this.query().trim().length >= 2 &&
      (this.isLoadingSuggestions() ||
        this.suggestions().length > 0 ||
        !!this.suggestionsError() ||
        this.suggestionsReady()),
  );

  /** The listbox exists only with options, so the combobox is expanded only then. */
  readonly suggestionsExpanded = computed(
    () => this.showSuggestions() && this.suggestions().length > 0,
  );

  /** DOM id of the suggestions listbox, unique per widget instance. */
  readonly listboxId = `${this.uid}-suggestions`;
  readonly activeSuggestionId = computed(() =>
    this.activeSuggestionIndex() >= 0
      ? suggestionOptionId(this.listboxId, this.activeSuggestionIndex())
      : null,
  );

  readonly cartQuantity = computed(() => this.cart.cart()?.totalQuantity ?? 0);
  readonly cartBadgeLabel = computed(() =>
    this.cartQuantity() > 99 ? "99+" : String(this.cartQuantity()),
  );
  readonly cartAriaLabel = computed(() =>
    this.cartQuantity() > 0
      ? `${this.resolvedMessages().cartAriaLabel} (${this.cartBadgeLabel()})`
      : this.resolvedMessages().cartAriaLabel,
  );

  readonly showVoiceReplay = computed(
    () =>
      this.enableVoice() &&
      this.enableTts() &&
      this.lastSearchMode() === "voice" &&
      this.audioClip() !== null,
  );
  readonly showVoiceBanner = computed(
    () =>
      this.enableVoice() &&
      (this.isRecording() ||
        this.isProcessing() ||
        this.isLoadingTts() ||
        Boolean(this.voiceError())),
  );

  /** Text of the always-mounted polite live region: voice states, searching, count, empty states. */
  readonly announcement = computed(() => {
    const showMission = this.showMission();
    const mission = this.mission();
    const resultCount = !this.showResults()
      ? null
      : showMission && mission
        ? mission.intents.reduce((sum, group) => sum + group.products.length, 0)
        : this.results().length > 0
          ? this.results().length
          : null;
    const voice = this.enableVoice();
    const lanes = this.showResults() && showMission && mission ? mission.intents : [];
    return searchAnnouncement(this.resolvedMessages(), {
      isRecording: voice && this.isRecording(),
      isProcessing: voice && this.isProcessing(),
      isLoadingTts: voice && this.isLoadingTts(),
      isLoading: this.isLoading(),
      hasError: Boolean(this.error()),
      resultCount,
      showEmptyResults: this.showEmptyResults(),
      noSuggestions:
        this.showSuggestions() &&
        !this.isLoadingSuggestions() &&
        !this.suggestionsError() &&
        this.suggestionsReady() &&
        this.suggestions().length === 0,
      missionFailedLanes: lanes.filter((group) => group.failed).length,
      missionEmptyLanes: lanes.filter((group) => !group.failed && group.products.length === 0)
        .length,
    });
  });

  readonly visibleFacets = computed(() => {
    const suggestedNames = new Set(this.suggestedFacets().map((facet) => facet.name));
    return this.facets().filter((facet) => suggestedNames.size === 0 || suggestedNames.has(facet.id));
  });
  readonly hasAppliedFilters = computed(
    () => Object.keys(this.meta()?.appliedFilters ?? {}).length > 0,
  );

  private cameraVideo: HTMLVideoElement | null = null;
  private cameraStream: MediaStream | null = null;
  private cameraRequestId = 0;
  private mediaRecorder: MediaRecorder | null = null;
  /** The microphone stream of the recording in progress; its tracks keep the mic indicator on. */
  private micStream: MediaStream | null = null;
  /** True between getUserMedia being requested and its stream arriving (blocks a second start). */
  private startingRecording = false;
  /** Counts finished recordings, so only the latest one clears the processing flags. */
  private voiceRunId = 0;
  private audioPlayer: AudioPlayer | null = null;
  private recordingTimer: ReturnType<typeof setInterval> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private suggestionsTimer: ReturnType<typeof setTimeout> | null = null;
  private searchAbort: AbortController | null = null;
  private suggestionsAbort: AbortController | null = null;
  /** Orders text, refinement, image and voice searches: only the latest one may show its result. */
  private searchRequestId = 0;
  private suggestionsRequestId = 0;
  /** Facet groups the shopper clicked a chip in. Filters the model echoed back are not in it. */
  private chipGroups: ReadonlySet<string> = new Set();
  private addedTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
  private destroyed = false;

  onQueryChange(value: string): void {
    this.query.set(value);
    this.activeSuggestionIndex.set(-1);
    this.suggestionsDismissed.set(false);
    this.clearDebounceTimers();

    const trimmed = value.trim();
    if (trimmed.length < 2) {
      this.lastSearchMode.set(null);
      this.clearVoiceAudio();
      this.clearResults();
      return;
    }

    this.lastSearchMode.set("text");
    this.clearVoiceAudio();

    if (this.enableAutocomplete()) {
      // Hide previous results so autocomplete can show while typing after a search.
      this.results.set([]);
      this.mission.set(null);
      this.error.set(null);
      this.isLoading.set(false);
      this.hasSearched.set(false);
      this.isLoadingSuggestions.set(true);
      this.suggestionsTimer = setTimeout(() => {
        this.suggestionsTimer = null;
        void this.fetchSuggestions(trimmed);
      }, 200);
      return;
    }

    this.isLoading.set(true);
    this.error.set(null);
    this.results.set([]);
    this.mission.set(null);
    this.meta.set(null);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.submit();
    }, 250);
  }

  selectSuggestion(suggestion: string): Promise<void> {
    this.activeSuggestionIndex.set(-1);
    this.query.set(suggestion);
    this.suggestions.set([]);
    return this.submit();
  }

  onInputKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      // An open listbox owns this Escape (APG combobox: it dismisses the popup). Marking the
      // event handled keeps the cart panel's document-level Escape from also closing the cart.
      if (this.showSuggestions() && this.suggestions().length > 0) {
        event.preventDefault();
      }
      this.activeSuggestionIndex.set(-1);
      this.suggestionsDismissed.set(true);
      return;
    }

    const suggestions = this.suggestions();
    if (!this.showSuggestions() || suggestions.length === 0) {
      return;
    }

    const active = this.activeSuggestionIndex();
    if (event.key === "ArrowDown") {
      event.preventDefault();
      this.activeSuggestionIndex.set(active < suggestions.length - 1 ? active + 1 : 0);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      this.activeSuggestionIndex.set(active > 0 ? active - 1 : suggestions.length - 1);
      return;
    }

    if (event.key === "Enter" && active >= 0) {
      event.preventDefault();
      const suggestion = suggestions[active];
      if (suggestion) {
        void this.selectSuggestion(suggestion);
      }
    }
  }

  toggleFacet(facetId: string, key: string, currency?: string): Promise<void> {
    const meta = this.meta();
    if (!meta?.searchTerms) return Promise.resolve();
    const previous = meta.appliedFilters ?? {};
    const filters = toggleFacetFilter(previous, facetId, key, currency);
    // The shopper touched this group: from now on it is a chip, not a model-echoed filter.
    return this.searchWithFacets(
      filters,
      trackChipGroups(this.chipGroups, this.facets(), previous, filters),
    );
  }

  clearFacetFilters(): Promise<void> {
    const meta = this.meta();
    if (!meta?.searchTerms) return Promise.resolve();
    return this.searchWithFacets(
      {},
      trackChipGroups(this.chipGroups, this.facets(), meta.appliedFilters ?? {}, {}),
    );
  }

  async startNewSearch(): Promise<void> {
    const q = this.query().trim();
    if (!q) return;
    this.suggestedFacets.set([]);
    this.facets.set([]);
    const meta = this.meta();
    this.meta.set(meta ? { ...meta, searchTerms: undefined, appliedFilters: undefined } : null);
    this.lastSearchMode.set("text");
    this.clearVoiceAudio();
    this.cancelSuggestions();
    this.suggestions.set([]);
    this.activeSuggestionIndex.set(-1);

    const { requestId, signal } = this.supersedeSearch();

    this.isLoading.set(true);
    this.error.set(null);
    this.results.set([]);
    this.mission.set(null);

    try {
      const data = await this.api.search(this.apiBaseUrl(), q, this.localeFields, signal, {
        includeFacets: this.enableFacets(),
        ...(this.enableMissions() ? { enableMissions: true } : {}),
      });
      if (!this.isCurrentSearch(requestId)) return;
      this.applySearchResult(data);
    } catch (err) {
      if (isAbortError(err) || !this.isCurrentSearch(requestId)) return;
      this.failSearch(this.failure(err, "searchFailed"));
    } finally {
      this.finishSearch(requestId);
    }
  }

  async submit(): Promise<void> {
    const q = this.query().trim();
    if (!q) return;

    const activeSuggestion = this.suggestions()[this.activeSuggestionIndex()];
    if (this.enableAutocomplete() && activeSuggestion) {
      return this.selectSuggestion(activeSuggestion);
    }

    this.lastSearchMode.set("text");
    this.clearVoiceAudio();
    // A search is being run: pending debounced searches and suggestions are obsolete.
    this.clearDebounceTimers();
    this.cancelSuggestions();
    this.suggestions.set([]);
    this.activeSuggestionIndex.set(-1);

    const previousMeta = this.meta();
    const isRefinement =
      this.enableFacets() &&
      this.hasFacetSession() &&
      Boolean(previousMeta?.searchTerms) &&
      !(this.enableMissions() && looksLikeCompoundShoppingList(q));
    // A refinement keeps the clicked chips; any other search starts a new facet session.
    const { requestId, signal } = isRefinement ? this.claimSearch() : this.supersedeSearch();
    const facetSelections = isRefinement
      ? selectedFacetChips(this.facets(), previousMeta?.appliedFilters ?? {}, this.chipGroups)
      : undefined;

    this.isLoading.set(true);
    this.error.set(null);
    this.results.set([]);
    this.mission.set(null);
    this.meta.set(null);

    try {
      const data = await this.api.search(
        this.apiBaseUrl(),
        isRefinement ? (previousMeta?.queryInterpretation ?? q) : q,
        this.localeFields,
        signal,
        isRefinement
          ? {
              searchTerms: previousMeta?.searchTerms,
              filters: previousMeta?.appliedFilters,
              refineQuery: q,
              suggestedFacets: this.suggestedFacets(),
              includeFacets: true,
              // Only for clicked chips: an absent field keeps the server's categories-only default.
              ...(facetSelections ? { facetSelections } : {}),
            }
          : {
              includeFacets: this.enableFacets(),
              ...(this.enableMissions() ? { enableMissions: true } : {}),
            },
      );
      if (!this.isCurrentSearch(requestId)) return;
      this.applySearchResult(data, isRefinement);
    } catch (err) {
      if (isAbortError(err) || !this.isCurrentSearch(requestId)) return;
      this.failSearch(this.failure(err, "searchFailed"));
    } finally {
      this.finishSearch(requestId);
    }
  }

  /** Searches by the image a file input just received (upload or native camera capture). */
  searchByImageInput(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Reset so choosing the same file again (after a failed search) fires change again.
    input.value = "";
    return file ? this.searchByImage(file) : Promise.resolve();
  }

  async openCameraOverlay(): Promise<void> {
    this.cameraError.set(null);
    const requestId = ++this.cameraRequestId;

    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        buildCameraConstraints(this.cameraFacingMode()),
      );
      if (this.destroyed || requestId !== this.cameraRequestId) {
        // Closed, superseded or destroyed while the permission prompt was open: do not open the
        // overlay and do not keep the camera on.
        stopMediaStream(stream);
        return;
      }
      stopMediaStream(this.cameraStream);
      this.cameraStream = stream;
      this.isCameraOpen.set(true);
      await this.attachCameraStream();
    } catch (err) {
      if (this.destroyed || requestId !== this.cameraRequestId) return;
      this.cameraError.set(getCameraErrorMessage(err, this.resolvedMessages()));
      this.closeCamera();
    }
  }

  async capturePhoto(): Promise<void> {
    const video = this.cameraVideo;
    if (!video) return;

    try {
      const file = await createJpegFileFromVideo(video);
      this.closeCamera();
      void this.searchByImage(file);
    } catch {
      this.closeCamera();
      this.error.set(this.resolvedMessages().couldNotCapturePhoto);
    }
  }

  closeCamera(): void {
    // A getUserMedia still pending must not open the overlay after this.
    this.cameraRequestId += 1;
    stopMediaStream(this.cameraStream);
    this.cameraStream = null;
    this.isCameraOpen.set(false);

    if (this.cameraVideo) {
      this.cameraVideo.srcObject = null;
      // The preview goes away with the overlay; a capture after this has nothing to read.
      this.cameraVideo = null;
    }
  }

  clearCameraError(): void {
    this.cameraError.set(null);
  }

  dragOver(event: DragEvent): void {
    if (!this.enableImageSearch()) {
      return;
    }
    event.preventDefault();
    this.isDragging.set(true);
  }

  drop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(false);
    if (!this.enableImageSearch()) {
      return;
    }
    const file = event.dataTransfer?.files[0];
    if (file) void this.searchByImage(file);
  }

  async searchByImage(file: File): Promise<void> {
    if (!file.type.startsWith("image/")) return;

    this.lastSearchMode.set("image");
    this.clearVoiceAudio();
    this.cancelSuggestions();
    this.suggestions.set([]);

    const { requestId, signal } = this.supersedeSearch();

    this.isLoading.set(true);
    this.error.set(null);
    this.results.set([]);
    this.mission.set(null);
    this.meta.set(null);

    try {
      const data = await this.api.searchByImage(
        this.apiBaseUrl(),
        file,
        this.localeFields,
        this.enableMissions(),
        signal,
      );
      if (!this.isCurrentSearch(requestId)) return;
      this.applySearchResult(data);
      if (data.interpretation) this.query.set(data.interpretation);
    } catch (err) {
      // Aborted by a newer search, a reset or destroy: not a failure the shopper should see.
      if (isAbortError(err) || !this.isCurrentSearch(requestId)) return;
      this.failSearch(this.failure(err, "imageSearchFailed"));
    } finally {
      this.finishSearch(requestId);
    }
  }

  clearVoiceError(): void {
    this.voiceError.set(null);
  }

  async toggleRecording(): Promise<void> {
    if (this.isRecording()) {
      this.stopRecording();
    } else {
      await this.startRecording();
    }
  }

  replayVoiceSummary(): void {
    const clip = this.audioClip();
    if (clip) {
      this.playClip(clip);
    }
  }

  addToCartLabel(product: ProductCard): string {
    return addToCartLabel(this.resolvedMessages(), this.addedProductIds(), product);
  }

  private get localeFields() {
    return {
      catalogLocale: this.catalogLocale(),
      queryLocale: this.queryLocale(),
      locale: this.locale(),
    };
  }

  private failure(error: unknown, fallback: MessageKey): string {
    return messageForError(error, this.resolvedMessages(), { fallback });
  }

  private async fetchSuggestions(searchQuery: string): Promise<void> {
    this.suggestionsAbort?.abort();
    const controller = new AbortController();
    this.suggestionsAbort = controller;
    const requestId = ++this.suggestionsRequestId;

    this.isLoadingSuggestions.set(true);
    this.suggestionsError.set(null);
    this.suggestionsReady.set(false);

    try {
      const data = await this.api.suggest(
        this.apiBaseUrl(),
        searchQuery,
        this.localeFields,
        controller.signal,
      );
      if (requestId !== this.suggestionsRequestId) return;
      this.suggestions.set(data.suggestions);
    } catch (err) {
      if (isAbortError(err) || requestId !== this.suggestionsRequestId) return;
      this.suggestions.set([]);
      this.suggestionsError.set(this.failure(err, "searchFailed"));
    } finally {
      if (requestId === this.suggestionsRequestId) {
        this.isLoadingSuggestions.set(false);
        this.suggestionsReady.set(true);
      }
    }
  }

  /** Aborts the suggestions request and makes a late response stale. */
  private cancelSuggestions(): void {
    this.suggestionsAbort?.abort();
    this.suggestionsAbort = null;
    this.suggestionsRequestId += 1;
    this.isLoadingSuggestions.set(false);
    this.suggestionsReady.set(false);
  }

  private clearDebounceTimers(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.suggestionsTimer) {
      clearTimeout(this.suggestionsTimer);
      this.suggestionsTimer = null;
    }
  }

  /** Makes a new search the current one: whatever was in flight is aborted and becomes stale. */
  private claimSearch(): { requestId: number; signal: AbortSignal } {
    this.searchAbort?.abort();
    const controller = new AbortController();
    this.searchAbort = controller;
    return { requestId: ++this.searchRequestId, signal: controller.signal };
  }

  /** A claim for a text, image or voice search: it also cancels pending debounced searches and forgets clicked chips. */
  private supersedeSearch(): { requestId: number; signal: AbortSignal } {
    this.clearDebounceTimers();
    this.chipGroups = new Set();
    return this.claimSearch();
  }

  private isCurrentSearch(requestId: number): boolean {
    return !this.destroyed && requestId === this.searchRequestId;
  }

  /** Ends the loading state of the search `requestId`, unless a newer one has taken over. */
  private finishSearch(requestId: number): void {
    if (this.isCurrentSearch(requestId)) {
      this.isLoading.set(false);
      this.hasSearched.set(true);
    }
  }

  private failSearch(message: string): void {
    this.error.set(message);
    this.results.set([]);
    this.mission.set(null);
    this.hasFacetSession.set(false);
    this.meta.set(null);
    this.chipGroups = new Set();
  }

  /** Back to the empty state (query shorter than two characters): whatever is in flight is stale. */
  private clearResults(): void {
    this.clearDebounceTimers();
    this.searchAbort?.abort();
    this.searchAbort = null;
    this.searchRequestId += 1;
    this.cancelSuggestions();
    this.chipGroups = new Set();
    this.results.set([]);
    this.mission.set(null);
    this.hasFacetSession.set(false);
    this.meta.set(null);
    this.facets.set([]);
    this.suggestedFacets.set([]);
    this.error.set(null);
    this.isLoading.set(false);
    this.hasSearched.set(false);
    this.suggestions.set([]);
    this.suggestionsError.set(null);
    this.suggestionsDismissed.set(false);
    this.activeSuggestionIndex.set(-1);
  }

  private async searchWithFacets(
    filters: InterpretedSearchFilters,
    chipGroups: ReadonlySet<string>,
  ): Promise<void> {
    const meta = this.meta();
    if (!meta?.searchTerms) return;
    this.isLoading.set(true);
    this.error.set(null);
    const { requestId, signal } = this.claimSearch();
    // Only for clicked chips: an absent field keeps the server's categories-only default.
    const facetSelections = selectedFacetChips(this.facets(), filters, chipGroups);

    try {
      const data = await this.api.search(
        this.apiBaseUrl(),
        meta.queryInterpretation ?? this.query(),
        this.localeFields,
        signal,
        {
          filters,
          searchTerms: meta.searchTerms,
          suggestedFacets: this.suggestedFacets(),
          includeFacets: true,
          ...(facetSelections ? { facetSelections } : {}),
        },
      );
      // A superseded refinement must not touch the clicked chips.
      if (!this.isCurrentSearch(requestId)) return;
      this.chipGroups = new Set(chipGroups);
      this.applySearchResult(data, true);
    } catch (err) {
      if (isAbortError(err) || !this.isCurrentSearch(requestId)) return;
      this.error.set(this.failure(err, "searchFailed"));
    } finally {
      this.finishSearch(requestId);
    }
  }

  /**
   * Shows a search result. A text, voice or image result starts a new facet session (no chip was
   * clicked in it); a refinement (`keepChips`) continues the current one.
   */
  private applySearchResult(
    data: Pick<SearchResult, "products" | "meta" | "mission" | "facets" | "suggestedFacets">,
    keepChips = false,
  ): void {
    if (!keepChips) {
      this.chipGroups = new Set();
    }
    this.results.set(data.products);
    this.mission.set(data.mission ?? null);
    this.meta.set(data.meta);
    this.facets.set(data.facets ?? []);
    this.suggestedFacets.set(data.suggestedFacets ?? []);
    this.hasFacetSession.set(!data.mission && this.enableFacets() && Boolean(data.meta.searchTerms));
  }

  /** Pushes the current configuration into the cart service (every input change). */
  syncCart(onCartChange: (snapshot: CartSnapshot | null) => void): void {
    this.cart.configure({
      apiBaseUrl: this.apiBaseUrl(),
      currency: this.currency(),
      country: this.country(),
      catalogLocale: this.catalogLocale(),
      messages: this.resolvedMessages(),
      enabled: this.enableCart(),
      onCartChange,
    });
  }

  async addToCart(product: ProductCard): Promise<void> {
    if (!product.sku && !product.id) {
      return;
    }
    const next = await this.cart.addToCart(toCartItem(product, 1));
    if (!next || this.destroyed) {
      return;
    }
    this.addedProductIds.update((added) => ({ ...added, [product.id]: true }));
    const existing = this.addedTimeouts.get(product.id);
    if (existing) {
      clearTimeout(existing);
    }
    this.addedTimeouts.set(
      product.id,
      setTimeout(() => {
        this.addedTimeouts.delete(product.id);
        this.addedProductIds.update(({ [product.id]: _removed, ...rest }) => rest);
      }, 1200),
    );
  }

  /** Registers the preview element (or null when it is gone) and attaches the stream to it. */
  attachCameraVideo(video: HTMLVideoElement | null): Promise<void> {
    this.cameraVideo = video;
    return this.attachCameraStream();
  }

  private async attachCameraStream(): Promise<void> {
    const video = this.cameraVideo;
    const stream = this.cameraStream;
    if (!video || !stream) {
      return;
    }
    video.srcObject = stream;
    try {
      await video.play();
    } catch {
      // Autoplay refused or the stream ended: the preview stays blank, capture reports it.
    }
  }

  private clearVoiceAudio(): void {
    this.audioPlayer?.stop();
    this.setAudio(null);
  }

  /** Sets (or clears) the spoken summary the replay button plays. */
  private setAudio(clip: Blob | null): void {
    this.audioClip.set(clip);
  }

  private playClip(clip: Blob): void {
    this.audioPlayer ??= createAudioPlayer();
    void this.audioPlayer.play(clip);
  }

  private stopRecording(): void {
    if (this.mediaRecorder?.state === "recording") {
      this.isProcessing.set(true);
      this.mediaRecorder.stop();
    }
    this.isRecording.set(false);
    this.stopRecordingTimer();
  }

  private async startRecording(): Promise<void> {
    if (this.startingRecording) return;
    this.startingRecording = true;
    this.voiceError.set(null);
    this.clearVoiceAudio();

    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (this.destroyed) {
        // The widget went away while the permission prompt was open: do not keep the mic on.
        stopMediaStream(stream);
        return;
      }
      const recorder = new MediaRecorder(stream);
      // This recording's own chunks, so a later recording cannot swap them out underneath it.
      const chunks: Blob[] = [];
      const micStream = stream;
      this.micStream = micStream;
      this.mediaRecorder = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };
      recorder.onstop = () => {
        stopMediaStream(micStream);
        // Only clear the shared fields when they still belong to this recorder.
        if (this.mediaRecorder === recorder) {
          this.micStream = null;
          this.mediaRecorder = null;
        }
        // The container the browser really recorded (webm on Chrome, mp4 on Safari), not a literal.
        void this.searchByVoice(new Blob(chunks, { type: recorder.mimeType }));
      };

      recorder.start();
      this.isRecording.set(true);
      this.startRecordingTimer();
    } catch (err) {
      // `new MediaRecorder` can throw after the permission was granted.
      stopMediaStream(stream);
      this.micStream = null;
      if (this.destroyed) return;
      this.voiceError.set(
        messageForError(err, this.resolvedMessages(), {
          device: "microphone",
          fallback: "microphoneUnavailable",
        }),
      );
    } finally {
      this.startingRecording = false;
    }
  }

  private async searchByVoice(blob: Blob): Promise<void> {
    const runId = ++this.voiceRunId;
    const { requestId, signal } = this.supersedeSearch();
    // The search this one replaced may have left the spinner on (a debounced or aborted search).
    this.isLoading.set(false);
    this.isProcessing.set(true);
    this.clearVoiceAudio();

    try {
      const data = await this.api.searchByVoice(
        this.apiBaseUrl(),
        blob,
        this.localeFields,
        this.enableTts(),
        this.enableMissions(),
        signal,
      );
      if (!this.isCurrentSearch(requestId)) {
        // A newer search (or destroy) superseded this one: its result must not show.
        return;
      }

      this.lastSearchMode.set("voice");
      this.query.set(data.transcript);
      this.applySearchResult({ products: data.products, meta: data.meta, mission: data.mission });
      this.error.set(null);
      this.voiceError.set(null);
      this.hasSearched.set(true);
      this.isProcessing.set(false);

      if (data.audioSummary) {
        const clip = audioFromBase64(data.audioSummary);
        this.setAudio(clip);
        this.playClip(clip);
      } else if (this.enableTts() && data.ttsText && data.ttsPending) {
        this.isLoadingTts.set(true);
        try {
          const clip = await this.api.synthesizeSpeech(this.apiBaseUrl(), data.ttsText, signal);
          if (!this.isCurrentSearch(requestId)) return;
          this.setAudio(clip);
          this.playClip(clip);
        } catch {
          // The results are already shown; a missing clip is not an error for the shopper.
          if (this.isCurrentSearch(requestId)) this.setAudio(null);
        }
      }
    } catch (err) {
      // Aborted by a reset, a newer search or destroy: not a failure the shopper should see.
      if (signal.aborted || isAbortError(err) || !this.isCurrentSearch(requestId)) return;
      this.voiceError.set(this.failure(err, "searchFailed"));
      this.setAudio(null);
    } finally {
      if (!this.destroyed && this.voiceRunId === runId) {
        this.isProcessing.set(false);
        this.isLoadingTts.set(false);
      }
    }
  }

  private startRecordingTimer(): void {
    this.stopRecordingTimer();
    this.recordingDuration.set(0);
    this.recordingTimer = setInterval(() => {
      this.recordingDuration.update((seconds) => seconds + 1);
    }, 1000);
  }

  private stopRecordingTimer(): void {
    if (this.recordingTimer) {
      clearInterval(this.recordingTimer);
      this.recordingTimer = null;
    }
    this.recordingDuration.set(0);
  }

  /** Detaches the recorder's handlers, stops it and releases the microphone. Safe to repeat. */
  private releaseRecording(): void {
    const recorder = this.mediaRecorder;
    this.mediaRecorder = null;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      if (recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          // Already stopped by the browser; the tracks below are what matter.
        }
      }
    }
    stopMediaStream(this.micStream);
    this.micStream = null;
  }

  /**
   * Destroy: no timer, request, recording or sound may outlive the widget. The component calls it
   * from its `ngOnDestroy()` (the store has no lifecycle hook of its own, so it runs once when
   * Angular destroys the widget); it is idempotent, so a host calling `ngOnDestroy()` directly
   * first is safe too.
   */
  teardown(): void {
    this.destroyed = true;
    this.clearDebounceTimers();
    for (const timeout of this.addedTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.addedTimeouts.clear();
    this.stopRecordingTimer();
    this.releaseRecording();
    this.closeCamera();
    // Bumping the ids makes responses that still arrive stale.
    this.searchAbort?.abort();
    this.searchAbort = null;
    this.searchRequestId += 1;
    this.suggestionsAbort?.abort();
    this.suggestionsAbort = null;
    this.suggestionsRequestId += 1;
    this.audioPlayer?.dispose();
    this.audioPlayer = null;
  }
}
