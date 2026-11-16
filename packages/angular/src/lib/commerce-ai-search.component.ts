import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  ViewEncapsulation,
  computed,
  viewChild,
} from "@angular/core";
import type { CartSnapshot, ProductCard } from "@commerce-ai-tool/core/client";
import { CommerceAiCartPanelComponent } from "./commerce-ai-cart-panel.component";
import { CommerceAiCartService } from "./commerce-ai-cart.service";
import { CommerceAiMissionResultsComponent } from "./commerce-ai-mission-results.component";
import { CommerceAiVoiceBannerComponent } from "./commerce-ai-voice-banner.component";
import { CommerceAiSearchStore } from "./search/commerce-ai-search.store";
import { CommerceAiCameraOverlayComponent } from "./search/camera-overlay.component";
import { CommerceAiFacetsComponent } from "./search/facets.component";
import { CommerceAiResultsComponent } from "./search/results.component";
import { CommerceAiSearchBarComponent } from "./search/search-bar.component";
import { CommerceAiSearchCompat } from "./search/search-compat";
import { CommerceAiSuggestionsComponent } from "./search/suggestions.component";

/**
 * The search widget: wires the per-instance `CommerceAiSearchStore` to the child components.
 * State and orchestration live in the store; the 2.x public members (inputs, former fields,
 * handlers) are inherited from `CommerceAiSearchCompat`.
 */
@Component({
  selector: "commerce-ai-search",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommerceAiCameraOverlayComponent,
    CommerceAiFacetsComponent,
    CommerceAiResultsComponent,
    CommerceAiSearchBarComponent,
    CommerceAiSuggestionsComponent,
    CommerceAiMissionResultsComponent,
    CommerceAiCartPanelComponent,
    CommerceAiVoiceBannerComponent,
  ],
  providers: [CommerceAiCartService, CommerceAiSearchStore],
  templateUrl: "./commerce-ai-search.component.html",
  encapsulation: ViewEncapsulation.None,
})
export class CommerceAiSearchComponent
  extends CommerceAiSearchCompat
  implements OnInit, OnChanges, OnDestroy
{
  @Output() productSelect = new EventEmitter<ProductCard>();
  /** Fires after every cart fetch or mutation when `enableCart` is true. */
  @Output() cartChange = new EventEmitter<CartSnapshot | null>();
  /** Opens the host-owned checkout route for the current non-empty cart. */
  @Output() checkout = new EventEmitter<CartSnapshot>();

  private readonly searchBar = viewChild(CommerceAiSearchBarComponent);
  private readonly cameraOverlay = viewChild(CommerceAiCameraOverlayComponent);
  private cameraInputOverride?: ElementRef<HTMLInputElement>;
  private cameraVideoOverride?: ElementRef<HTMLVideoElement>;

  /** The hidden native camera input. Resolved from the view; an assigned value takes precedence. */
  get cameraInputRef(): ElementRef<HTMLInputElement> | undefined {
    return this.cameraInputOverride ?? this.searchBar()?.cameraInput();
  }
  set cameraInputRef(ref: ElementRef<HTMLInputElement> | undefined) {
    this.cameraInputOverride = ref;
  }

  /** The camera preview element, while the overlay shows it. An assigned value takes precedence. */
  get cameraVideoRef(): ElementRef<HTMLVideoElement> | undefined {
    return this.cameraVideoOverride ?? this.cameraOverlay()?.videoRef();
  }
  set cameraVideoRef(ref: ElementRef<HTMLVideoElement> | undefined) {
    this.cameraVideoOverride = ref;
  }

  protected readonly cameraTrigger = computed(
    () => this.searchBar()?.cameraButton()?.nativeElement ?? null,
  );

  protected readonly searchField = computed(
    () => this.searchBar()?.searchInput()?.nativeElement ?? null,
  );

  protected readonly cartToggle = computed(
    () => this.searchBar()?.cartToggleButton()?.nativeElement ?? null,
  );

  ngOnInit(): void {
    this.syncCart();
  }

  ngOnChanges(): void {
    this.syncCart();
  }

  ngOnDestroy(): void {
    this.store.teardown();
  }

  private syncCart(): void {
    this.store.syncCart((snapshot) => this.cartChange.emit(snapshot));
  }
}
