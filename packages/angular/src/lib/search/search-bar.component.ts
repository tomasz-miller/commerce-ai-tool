import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewEncapsulation,
  input,
  output,
  viewChild,
} from "@angular/core";
import type {
  CameraFacingMode,
  ResolvedCommerceAISearchMessages,
} from "@commerce-ai-tool/core/client";

/**
 * The search form: query field (combobox when autocomplete is on), voice / camera / image
 * buttons, the voice replay button and the cart toggle. It is the host element of the `<form>`;
 * the suggestions listbox is projected into it. Presentational: everything it shows comes in
 * through inputs and every action leaves through an output.
 */
@Component({
  selector: "form[commerce-ai-search-bar]",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  templateUrl: "./search-bar.component.html",
  host: {
    class: "cat-search-bar",
    "[class.cat-search-bar--voice-active]": "isRecording()",
    "(submit)": "onSubmit($event)",
  },
})
export class CommerceAiSearchBarComponent {
  readonly messages = input.required<ResolvedCommerceAISearchMessages>();
  readonly query = input("");

  readonly enableAutocomplete = input(false);
  /** The suggestions listbox is rendered (with options): drives `aria-expanded` and `aria-controls`. */
  readonly expanded = input(false);
  readonly listboxId = input.required<string>();
  readonly activeDescendantId = input<string | null>(null);

  readonly enableVoice = input(true);
  readonly isRecording = input(false);
  readonly isProcessing = input(false);
  readonly showVoiceReplay = input(false);

  readonly enableCameraSearch = input(true);
  readonly cameraFacingMode = input<CameraFacingMode>("environment");
  readonly enableImageSearch = input(true);
  readonly isLoading = input(false);

  readonly enableCart = input(false);
  readonly cartOpen = input(false);
  readonly cartLabel = input("");
  readonly cartQuantity = input(0);
  readonly cartBadgeLabel = input("");

  readonly queryChange = output<string>();
  readonly inputKeyDown = output<KeyboardEvent>();
  readonly submitted = output<void>();
  readonly voiceToggle = output<void>();
  readonly cameraClick = output<void>();
  readonly imageSelected = output<Event>();
  readonly cameraFileSelected = output<Event>();
  readonly replay = output<void>();
  readonly cartToggle = output<void>();

  /** The hidden native camera input (mobile browsers open their own camera app through it). */
  readonly cameraInput = viewChild<ElementRef<HTMLInputElement>>("cameraInput");

  /** The camera button: the camera overlay returns focus to it when it closes. */
  readonly cameraButton = viewChild<ElementRef<HTMLButtonElement>>("cameraButton");

  /** The search field: focus goes back to it when the control that opened an overlay is disabled. */
  readonly searchInput = viewChild<ElementRef<HTMLInputElement>>("searchInput");

  /** The cart toggle: the cart panel returns focus to it when it closes. */
  readonly cartToggleButton = viewChild<ElementRef<HTMLButtonElement>>("cartToggleButton");

  protected onInput(event: Event): void {
    // While an IME composes (Japanese, Chinese, Korean, ...) the field holds unconfirmed text:
    // search on the confirmed text at `compositionend`, as Angular's DefaultValueAccessor does.
    if ((event as InputEvent).isComposing) return;
    this.queryChange.emit((event.target as HTMLInputElement).value);
  }

  protected onCompositionEnd(event: Event): void {
    this.queryChange.emit((event.target as HTMLInputElement).value);
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    this.submitted.emit();
  }
}
