import {
  ApplicationRef,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  EnvironmentInjector,
  Injector,
  ViewEncapsulation,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  viewChild,
} from "@angular/core";
import { DOCUMENT } from "@angular/common";
import type { ResolvedCommerceAISearchMessages } from "@commerce-ai-tool/core/client";
import { focusFirstAvailable, getFocusable } from "@commerce-ai-tool/core/client";

/**
 * The camera capture overlay as a modal `<dialog>`: the browser makes the rest of the page inert;
 * focus moves to the capture button (the dismiss button while an error shows), Tab wraps inside
 * it, and Escape closes it (or dismisses the error it shows). On close, focus goes back to the
 * control that opened it. It owns no camera logic: the stream stays in the search store, which receives the preview element through
 * `videoChange` and the user's choices through `closed`, `captured` and `errorDismissed`.
 */
@Component({
  selector: "dialog[commerce-ai-camera-overlay]",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  templateUrl: "./camera-overlay.component.html",
  host: {
    class: "cat-camera-overlay",
    "aria-modal": "true",
    "[attr.aria-label]": "messages().cameraCapture",
    "(cancel)": "onCancel($event)",
    "(keydown)": "onKeyDown($event)",
  },
})
export class CommerceAiCameraOverlayComponent {
  readonly messages = input.required<ResolvedCommerceAISearchMessages>();
  /** A camera error to show instead of the preview. */
  readonly error = input<string | null>(null);
  /** Where focus goes on close; defaults to the element that was focused when the overlay opened. */
  readonly returnFocusTo = input<HTMLElement | null>(null);
  /**
   * Where focus goes when the return target is disabled or gone, which is the normal case after a
   * capture: the image search starts and disables the camera button. The search field.
   */
  readonly fallbackFocusTo = input<HTMLElement | null>(null);

  /** Cancel button or Escape while the preview shows. */
  readonly closed = output<void>();
  readonly captured = output<void>();
  /** Dismiss button or Escape while an error shows. */
  readonly errorDismissed = output<void>();
  /** The `<video>` of the preview, or null while an error shows. */
  readonly videoChange = output<HTMLVideoElement | null>();

  readonly videoRef = viewChild<ElementRef<HTMLVideoElement>>("video");

  private readonly dialog = inject<ElementRef<HTMLDialogElement>>(ElementRef).nativeElement;
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly environmentInjector = inject(EnvironmentInjector);
  private readonly appRef = inject(ApplicationRef);
  private readonly opener = this.document.activeElement;

  constructor() {
    afterNextRender(() => this.open());
    effect(() => {
      this.videoChange.emit(this.videoRef()?.nativeElement ?? null);
      // Initial focus: the capture button, or the dismiss button when an error replaces it.
      this.error();
      // A fresh afterNextRender per run on purpose: the focus has to wait until the new view
      // (preview or error) is in the DOM, and after `open()` has made the dialog visible.
      afterNextRender(() => this.focusPrimary(), { injector: this.injector });
    });
    inject(DestroyRef).onDestroy(() => this.close());
  }

  protected onCancel(event: Event): void {
    // Closing is the store's decision (it stops the stream); the element goes away with the state.
    event.preventDefault();
    if (this.error()) {
      this.errorDismissed.emit();
    } else {
      this.closed.emit();
    }
  }

  /** APG: Tab wraps from the last control to the first and Shift+Tab the other way round. */
  protected onKeyDown(event: KeyboardEvent): void {
    if (event.key !== "Tab") return;
    const controls = getFocusable(this.dialog);
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (!first || !last) return;
    const active = this.document.activeElement;
    if (event.shiftKey && (active === first || active === this.dialog)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private recheckFocusAfterRender(targets: Array<Element | null>): void {
    // Nothing to re-check once the app is going away (app teardown, HMR, a destroyed lazy
    // injector): registering a render hook on a destroyed injector throws NG0205.
    if (this.appRef.destroyed || this.environmentInjector.destroyed) return;
    afterNextRender(
      () => {
        const active = this.document.activeElement;
        if (!active || active === this.document.body || (active as HTMLButtonElement).disabled) {
          focusFirstAvailable(...targets);
        }
      },
      { injector: this.environmentInjector },
    );
  }

  private focusPrimary(): void {
    const target = this.dialog.querySelector<HTMLElement>(
      ".cat-camera-overlay__btn--primary, .cat-camera-overlay__error button",
    );
    target?.focus();
  }

  private open(): void {
    if (this.dialog.open) return;
    if (typeof this.dialog.showModal === "function") {
      this.dialog.showModal();
    } else {
      this.dialog.setAttribute("open", "");
    }
  }

  private close(): void {
    if (typeof this.dialog.close === "function") {
      if (this.dialog.open) this.dialog.close();
    } else {
      this.dialog.removeAttribute("open");
    }
    // The opener may be disabled by now (a capture starts a search): fall back to the search field.
    const targets = [this.returnFocusTo(), this.opener, this.fallbackFocusTo()];
    focusFirstAvailable(...targets);
    // This view is destroyed while the page re-renders: the search bar may only disable the camera
    // button afterwards, which would drop the focus we just gave it. Check again once rendered
    // (with the app's injector: this component's own is gone by then).
    this.recheckFocusAfterRender(targets);
  }
}
