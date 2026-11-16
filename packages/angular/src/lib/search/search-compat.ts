import { Directive, Input, inject, type ElementRef } from "@angular/core";
import type {
  AddToCartLineItem,
  CommerceAISearchMessages,
  MissionSearchResult,
  ProductCard,
  ResolvedCommerceAISearchMessages,
  SearchFacetGroup,
  SuggestedFacet,
  ThemeMode,
} from "@commerce-ai-tool/core/client";
import {
  hexColorSwatchValue,
  isColorLikeFacetName,
  isFacetFilterSelected,
  prefersNativeCamera,
  type CameraFacingMode,
} from "@commerce-ai-tool/core/client";
import { CommerceAiSearchStore } from "./commerce-ai-search.store";
import type { SearchMetaView, SearchMode } from "./search.model";

/**
 * The 2.x public surface of `CommerceAiSearchComponent`, kept as a thin layer over
 * `CommerceAiSearchStore`: inputs, former fields, derived values and event handlers keep their
 * names and types, and every one delegates to the store. Hosts that read the component through
 * `@ViewChild` or a template reference keep working; new code should not grow this class.
 *
 * It is an abstract directive only so the `@Input()` accessors are inherited by the component.
 */
@Directive()
export abstract class CommerceAiSearchCompat {
  protected readonly store = inject(CommerceAiSearchStore);
  readonly cart = this.store.cart;

  readonly addMissionItems = (items: AddToCartLineItem[]) => this.cart.addItems(items);

  /** The hidden native camera input; owned by the view, so the component supplies it. */
  abstract cameraInputRef?: ElementRef<HTMLInputElement>;

  // Inputs.
  @Input() set apiBaseUrl(value: string) {
    this.store.apiBaseUrl.set(value);
  }
  get apiBaseUrl(): string {
    return this.store.apiBaseUrl();
  }
  @Input() set catalogLocale(value: string | undefined) {
    this.store.catalogLocale.set(value);
  }
  get catalogLocale(): string | undefined {
    return this.store.catalogLocale();
  }
  @Input() set queryLocale(value: string | undefined) {
    this.store.queryLocale.set(value);
  }
  get queryLocale(): string | undefined {
    return this.store.queryLocale();
  }
  /** @deprecated Use queryLocale */
  @Input() set locale(value: string | undefined) {
    this.store.locale.set(value);
  }
  get locale(): string | undefined {
    return this.store.locale();
  }
  /** Enable multi-item shopping missions on text, voice, and image search. Default false. */
  @Input() set enableMissions(value: boolean) {
    this.store.enableMissions.set(value);
  }
  get enableMissions(): boolean {
    return this.store.enableMissions();
  }
  /** Currency for cart creation. Required when `enableCart` is true unless the server has a default. */
  @Input() set currency(value: string | undefined) {
    this.store.currency.set(value);
  }
  get currency(): string | undefined {
    return this.store.currency();
  }
  /** Optional ISO country code used for commercetools price selection. */
  @Input() set country(value: string | undefined) {
    this.store.country.set(value);
  }
  get country(): string | undefined {
    return this.store.country();
  }
  @Input() set theme(value: ThemeMode) {
    this.store.theme.set(value);
  }
  get theme(): ThemeMode {
    return this.store.theme();
  }
  @Input() set placeholder(value: string) {
    this.store.placeholder.set(value);
  }
  get placeholder(): string {
    return this.store.placeholder();
  }
  @Input() set messages(value: Partial<CommerceAISearchMessages> | undefined) {
    this.store.messages.set(value);
  }
  get messages(): Partial<CommerceAISearchMessages> | undefined {
    return this.store.messages();
  }
  @Input() set enableAutocomplete(value: boolean) {
    this.store.enableAutocomplete.set(value);
  }
  get enableAutocomplete(): boolean {
    return this.store.enableAutocomplete();
  }
  @Input() set enableFacets(value: boolean) {
    this.store.enableFacets.set(value);
  }
  get enableFacets(): boolean {
    return this.store.enableFacets();
  }
  /** Show microphone search controls. */
  @Input() set enableVoice(value: boolean) {
    this.store.enableVoice.set(value);
  }
  get enableVoice(): boolean {
    return this.store.enableVoice();
  }
  /** Show local image upload and drag-and-drop search controls. */
  @Input() set enableImageSearch(value: boolean) {
    this.store.enableImageSearch.set(value);
  }
  get enableImageSearch(): boolean {
    return this.store.enableImageSearch();
  }
  /** Show camera capture search controls independently of image upload. */
  @Input() set enableCameraSearch(value: boolean) {
    this.store.enableCameraSearch.set(value);
  }
  get enableCameraSearch(): boolean {
    return this.store.enableCameraSearch();
  }
  @Input() set cameraFacingMode(value: CameraFacingMode) {
    this.store.cameraFacingMode.set(value);
  }
  get cameraFacingMode(): CameraFacingMode {
    return this.store.cameraFacingMode();
  }
  @Input() set enableTts(value: boolean) {
    this.store.enableTts.set(value);
  }
  get enableTts(): boolean {
    return this.store.enableTts();
  }
  /** Enable built-in add-to-cart buttons and cart preview panel. Default false. */
  @Input() set enableCart(value: boolean) {
    this.store.enableCart.set(value);
  }
  get enableCart(): boolean {
    return this.store.enableCart();
  }

  // Former public fields: read and assignable, as in 2.x.
  get query(): string {
    return this.store.query();
  }
  set query(value: string) {
    this.store.query.set(value);
  }
  get suggestions(): string[] {
    return this.store.suggestions();
  }
  set suggestions(value: string[]) {
    this.store.suggestions.set(value);
  }
  get activeSuggestionIndex(): number {
    return this.store.activeSuggestionIndex();
  }
  set activeSuggestionIndex(value: number) {
    this.store.activeSuggestionIndex.set(value);
  }
  get isLoadingSuggestions(): boolean {
    return this.store.isLoadingSuggestions();
  }
  set isLoadingSuggestions(value: boolean) {
    this.store.isLoadingSuggestions.set(value);
  }
  get suggestionsError(): string | null {
    return this.store.suggestionsError();
  }
  set suggestionsError(value: string | null) {
    this.store.suggestionsError.set(value);
  }
  get suggestionsReady(): boolean {
    return this.store.suggestionsReady();
  }
  set suggestionsReady(value: boolean) {
    this.store.suggestionsReady.set(value);
  }
  get suggestionsDismissed(): boolean {
    return this.store.suggestionsDismissed();
  }
  set suggestionsDismissed(value: boolean) {
    this.store.suggestionsDismissed.set(value);
  }
  get results(): ProductCard[] {
    return this.store.results();
  }
  set results(value: ProductCard[]) {
    this.store.results.set(value);
  }
  get mission(): MissionSearchResult | null {
    return this.store.mission();
  }
  set mission(value: MissionSearchResult | null) {
    this.store.mission.set(value);
  }
  get hasFacetSession(): boolean {
    return this.store.hasFacetSession();
  }
  set hasFacetSession(value: boolean) {
    this.store.hasFacetSession.set(value);
  }
  get addedProductIds(): Record<string, true> {
    return this.store.addedProductIds();
  }
  set addedProductIds(value: Record<string, true>) {
    this.store.addedProductIds.set(value);
  }
  get meta(): SearchMetaView | null {
    return this.store.meta();
  }
  set meta(value: SearchMetaView | null) {
    this.store.meta.set(value);
  }
  get facets(): SearchFacetGroup[] {
    return this.store.facets();
  }
  set facets(value: SearchFacetGroup[]) {
    this.store.facets.set(value);
  }
  get suggestedFacets(): SuggestedFacet[] {
    return this.store.suggestedFacets();
  }
  set suggestedFacets(value: SuggestedFacet[]) {
    this.store.suggestedFacets.set(value);
  }
  get isLoading(): boolean {
    return this.store.isLoading();
  }
  set isLoading(value: boolean) {
    this.store.isLoading.set(value);
  }
  get hasSearched(): boolean {
    return this.store.hasSearched();
  }
  set hasSearched(value: boolean) {
    this.store.hasSearched.set(value);
  }
  get error(): string | null {
    return this.store.error();
  }
  set error(value: string | null) {
    this.store.error.set(value);
  }
  get isDragging(): boolean {
    return this.store.isDragging();
  }
  set isDragging(value: boolean) {
    this.store.isDragging.set(value);
  }
  get isRecording(): boolean {
    return this.store.isRecording();
  }
  set isRecording(value: boolean) {
    this.store.isRecording.set(value);
  }
  get isProcessing(): boolean {
    return this.store.isProcessing();
  }
  set isProcessing(value: boolean) {
    this.store.isProcessing.set(value);
  }
  get isLoadingTts(): boolean {
    return this.store.isLoadingTts();
  }
  set isLoadingTts(value: boolean) {
    this.store.isLoadingTts.set(value);
  }
  get isCameraOpen(): boolean {
    return this.store.isCameraOpen();
  }
  set isCameraOpen(value: boolean) {
    this.store.isCameraOpen.set(value);
  }
  get cameraError(): string | null {
    return this.store.cameraError();
  }
  set cameraError(value: string | null) {
    this.store.cameraError.set(value);
  }
  get voiceError(): string | null {
    return this.store.voiceError();
  }
  set voiceError(value: string | null) {
    this.store.voiceError.set(value);
  }
  get lastSearchMode(): SearchMode {
    return this.store.lastSearchMode();
  }
  set lastSearchMode(value: SearchMode) {
    this.store.lastSearchMode.set(value);
  }
  get recordingDuration(): number {
    return this.store.recordingDuration();
  }
  set recordingDuration(value: number) {
    this.store.recordingDuration.set(value);
  }

  // Former public getters.
  get resolvedMessages(): ResolvedCommerceAISearchMessages {
    return this.store.resolvedMessages();
  }
  get showMission(): boolean {
    return this.store.showMission();
  }
  get showMissionVisible(): boolean {
    return this.store.showMissionVisible();
  }
  get missionLaneCount(): number {
    return this.store.missionLaneCount();
  }
  get showResults(): boolean {
    return this.store.showResults();
  }
  get showSuggestions(): boolean {
    return this.store.showSuggestions();
  }
  get activeSuggestionId(): string | null {
    return this.store.activeSuggestionId();
  }
  get cartQuantity(): number {
    return this.store.cartQuantity();
  }
  get cartBadgeLabel(): string {
    return this.store.cartBadgeLabel();
  }
  get cartAriaLabel(): string {
    return this.store.cartAriaLabel();
  }
  get showVoiceReplay(): boolean {
    return this.store.showVoiceReplay();
  }
  get showVoiceBanner(): boolean {
    return this.store.showVoiceBanner();
  }
  get visibleFacets(): SearchFacetGroup[] {
    return this.store.visibleFacets();
  }
  get hasAppliedFilters(): boolean {
    return this.store.hasAppliedFilters();
  }

  // Former public event handlers (all return void, as in 2.x).
  onQueryChange(value: string): void {
    this.store.onQueryChange(value);
  }

  onSuggestionSelect(suggestion: string): void {
    void this.store.selectSuggestion(suggestion);
  }

  onInputKeyDown(event: KeyboardEvent): void {
    this.store.onInputKeyDown(event);
  }

  onSubmit(): void {
    void this.store.submit();
  }

  isFacetSelected(facetId: string, key: string, currency?: string): boolean {
    return isFacetFilterSelected(this.store.meta()?.appliedFilters ?? {}, facetId, key, currency);
  }

  facetSwatch(facetId: string, key: string): string | undefined {
    return isColorLikeFacetName(facetId) ? hexColorSwatchValue(key) : undefined;
  }

  toggleFacet(facetId: string, key: string, currency?: string): void {
    void this.store.toggleFacet(facetId, key, currency);
  }

  clearFacetFilters(): void {
    void this.store.clearFacetFilters();
  }

  startNewSearch(): void {
    void this.store.startNewSearch();
  }

  onFileSelected(event: Event): void {
    void this.store.searchByImageInput(event);
  }

  onCameraFileSelected(event: Event): void {
    void this.store.searchByImageInput(event);
  }

  searchByImage(file: File): void {
    void this.store.searchByImage(file);
  }

  openCamera(): void {
    this.store.clearCameraError();
    if (prefersNativeCamera()) {
      this.cameraInputRef?.nativeElement.click();
      return;
    }
    void this.store.openCameraOverlay();
  }

  openCameraOverlay(): Promise<void> {
    return this.store.openCameraOverlay();
  }

  capturePhoto(): Promise<void> {
    return this.store.capturePhoto();
  }

  closeCamera(): void {
    this.store.closeCamera();
  }

  clearCameraError(): void {
    this.store.clearCameraError();
  }

  onDragOver(event: DragEvent): void {
    this.store.dragOver(event);
  }

  onDrop(event: DragEvent): void {
    this.store.drop(event);
  }

  clearVoiceError(): void {
    this.store.clearVoiceError();
  }

  toggleRecording(): Promise<void> {
    return this.store.toggleRecording();
  }

  replayVoiceSummary(): void {
    this.store.replayVoiceSummary();
  }

  addToCartLabel(product: ProductCard): string {
    return this.store.addToCartLabel(product);
  }

  onAddItem(product: ProductCard): void {
    void this.store.addToCart(product);
  }

  onCartRemove(lineItemId: string): void {
    void this.cart.removeFromCart(lineItemId);
  }

  onCartQuantityChange(event: { lineItemId: string; quantity: number }): void {
    void this.cart.updateQuantity(event.lineItemId, event.quantity);
  }

  onCartLogin(input: { email: string; password: string }): void {
    void this.cart.login(input);
  }

  onCartLogout(): void {
    void this.cart.logout();
  }
}
