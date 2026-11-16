import { DOCUMENT } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
  afterEveryRender,
  afterNextRender,
  inject,
  signal,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import type {
  CartSnapshot,
  CommerceAISearchMessages,
  CustomerSnapshot,
  ResolvedCommerceAISearchMessages,
} from "@commerce-ai-tool/core/client";
import {
  MAX_LINE_ITEM_QUANTITY,
  focusFirstAvailable,
  getFocusable,
  quantityGroupLabel,
  removeItemLabel,
  resolveCommerceAISearchMessages,
} from "@commerce-ai-tool/core/client";

/** Must match the `max-width` of the full-screen cart sheet in packages/styles. */
const FULL_SCREEN_QUERY = "(max-width: 36rem)";


export function formatLineTotal(
  price: CartSnapshot["lineItems"][number]["price"],
  quantity: number,
  locale?: string,
): string | null {
  if (!price) {
    return null;
  }
  return new Intl.NumberFormat(locale || undefined, {
    style: "currency",
    currency: price.currency,
  }).format(price.amount * quantity);
}

@Component({
  selector: "commerce-ai-cart-panel",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <section
      class="cat-cart-panel"
      [class.cat-cart-panel--with-items]="!isEmpty"
      [attr.role]="fullScreenSig() ? 'dialog' : null"
      [attr.aria-modal]="fullScreenSig() ? 'true' : null"
      [attr.aria-label]="messages.cartAriaLabel"
      (keydown)="onKeyDown($event)"
    >
      <header class="cat-cart-panel__header">
        <h2 class="cat-cart-panel__title">{{ messages.cart }}</h2>
        <button type="button" class="cat-icon-btn" (click)="close.emit()" [attr.aria-label]="messages.closeCart">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </header>

      @if (visibleError) {
        <div class="cat-status cat-status--error" role="alert">{{ visibleError }}</div>
      }

      @if (isEmpty) {
        <div class="cat-cart-panel__empty">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
            <path d="M3 6h18" />
            <path d="M16 10a4 4 0 0 1-8 0" />
          </svg>
          <span>{{ messages.emptyCart }}</span>
        </div>
      } @else {
        <ul class="cat-cart-panel__items">
          @for (item of cart!.lineItems; track item.id) {
            <li class="cat-cart-item" [attr.data-line-item-id]="item.id">
              @if (item.imageUrl) {
                <img [src]="item.imageUrl" alt="" class="cat-cart-item__image" />
              } @else {
                <div class="cat-cart-item__image cat-cart-item__image--placeholder">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <path d="M16.5 9.4 7.55 4.24" />
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                    <polyline points="3.29 7 12 12 20.71 7" />
                    <line x1="12" x2="12" y1="22" y2="12" />
                  </svg>
                </div>
              }
              <div class="cat-cart-item__info">
                <div class="cat-cart-item__name">{{ item.name }}</div>
                @if (item.price) {
                  <div class="cat-cart-item__price">
                    <span>{{ item.price.formatted }} {{ messages.each }}</span>
                    <strong>{{ item.totalPrice?.formatted ?? lineTotal(item) }}</strong>
                  </div>
                }
                <div class="cat-cart-item__qty" role="group" [attr.aria-label]="quantityLabel(item)">
                  <button
                    type="button"
                    class="cat-cart-item__qty-btn"
                    [attr.aria-label]="messages.decreaseQuantity"
                    [disabled]="isLoading || item.quantity <= 1"
                    (click)="quantityChange.emit({ lineItemId: item.id, quantity: item.quantity - 1 })"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                      <path d="M5 12h14" />
                    </svg>
                  </button>
                  <span class="cat-cart-item__qty-value" role="status">{{ item.quantity }}</span>
                  <button
                    type="button"
                    class="cat-cart-item__qty-btn"
                    [attr.aria-label]="messages.increaseQuantity"
                    [disabled]="isLoading || item.quantity >= maxQuantity"
                    (click)="onIncrease(item)"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                      <path d="M5 12h14" />
                      <path d="M12 5v14" />
                    </svg>
                  </button>
                </div>
              </div>
              <button
                type="button"
                class="cat-icon-btn"
                [attr.aria-label]="removeLabel(item)"
                [disabled]="isLoading"
                (click)="remove.emit(item.id)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <path d="M3 6h18" />
                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                </svg>
              </button>
            </li>
          }
        </ul>
      }

      <div class="cat-cart-panel__auth">
        @if (customer) {
          <div class="cat-cart-panel__signed-in">
            <span>{{ messages.signedInAs }} {{ customer.email }}</span>
            <button type="button" class="cat-cart-panel__sign-out" (click)="logout.emit()">
              {{ messages.signOut }}
            </button>
          </div>
        } @else {
          <button
            type="button"
            class="cat-cart-panel__auth-toggle"
            [disabled]="isLoggingIn"
            [attr.aria-expanded]="isAuthExpandedSig()"
            (click)="isAuthExpandedSig.set(!isAuthExpandedSig())"
          >
            <span class="cat-cart-panel__auth-toggle-copy">
              <span class="cat-cart-panel__auth-icon" aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="8" r="5" />
                  <path d="M20 21a8 8 0 0 0-16 0" />
                </svg>
              </span>
              {{ messages.signInToSyncCart }}
            </span>
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
              [class.cat-cart-panel__auth-chevron--open]="isAuthExpandedSig()"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          @if (isAuthExpandedSig()) {
            <form class="cat-cart-panel__auth-form" (ngSubmit)="onLoginSubmit()">
              <label class="cat-cart-panel__field">
                <span class="cat-cart-panel__label">{{ messages.email }}</span>
                <input
                  class="cat-cart-panel__input"
                  type="email"
                  name="email"
                  autocomplete="email"
                  required
                  [disabled]="isLoggingIn"
                  [(ngModel)]="emailSig"
                />
              </label>
              <label class="cat-cart-panel__field">
                <span class="cat-cart-panel__label">{{ messages.password }}</span>
                <input
                  class="cat-cart-panel__input"
                  type="password"
                  name="password"
                  autocomplete="current-password"
                  required
                  [disabled]="isLoggingIn"
                  [(ngModel)]="passwordSig"
                />
              </label>
              <button type="submit" class="cat-cart-panel__submit" [disabled]="isLoggingIn">
                {{ messages.signIn }}
              </button>
            </form>
          }
        }
      </div>

      @if (!isEmpty) {
        <footer class="cat-cart-panel__footer">
          <div class="cat-cart-panel__total">
            <span>{{ messages.total }}</span>
            <strong>{{ cart!.totalPrice.formatted }}</strong>
          </div>
          @if (showCheckout && cart) {
            <button
              type="button"
              class="cat-checkout-cta"
              [disabled]="isLoading"
              (click)="checkout.emit(cart)"
            >
              <span>{{ messages.checkout }}</span>
              <span class="cat-checkout-cta__icon" aria-hidden="true">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </span>
            </button>
          }
        </footer>
      }
    </section>
  `,
})
export class CommerceAiCartPanelComponent {
  @Input() cart: CartSnapshot | null = null;
  @Input() customer: CustomerSnapshot | null = null;
  @Input() isLoading = false;
  @Input() isLoggingIn = false;
  @Input() error: string | null = null;
  /** Accepts partial or full messages; keys left out fall back to the English defaults. */
  @Input({
    required: true,
    transform: (value: CommerceAISearchMessages) => resolveCommerceAISearchMessages(value),
  })
  messages!: ResolvedCommerceAISearchMessages;
  @Input() catalogLocale?: string;
  @Input() showCheckout = false;
  /** Where focus goes when the panel closes (the cart toggle); defaults to the opener. */
  @Input() returnFocusTo: HTMLElement | null = null;

  @Output() close = new EventEmitter<void>();
  @Output() remove = new EventEmitter<string>();
  @Output() quantityChange = new EventEmitter<{ lineItemId: string; quantity: number }>();
  @Output() login = new EventEmitter<{ email: string; password: string }>();
  @Output() logout = new EventEmitter<void>();
  @Output() checkout = new EventEmitter<CartSnapshot>();

  // Local form state as signals: the panel re-renders when it changes, with or without zone.js.
  protected readonly emailSig = signal("");
  protected readonly passwordSig = signal("");
  protected readonly isAuthExpandedSig = signal(false);
  /** True while the cart is the full-screen sheet: then it is a modal dialog. */
  protected readonly fullScreenSig = signal(false);
  protected readonly maxQuantity = MAX_LINE_ITEM_QUANTITY;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly document = inject(DOCUMENT);
  private readonly opener = this.document.activeElement;
  /** The line whose "+" reached the maximum: focus must not leave the panel with that button. */
  private maxReachedItemId: string | null = null;

  constructor() {
    const destroyRef = inject(DestroyRef);
    // matchMedia only after the first render, so server rendering never touches `window`.
    afterNextRender(() => {
      const view = this.document.defaultView;
      if (!view || typeof view.matchMedia !== "function") return;
      const query = view.matchMedia(FULL_SCREEN_QUERY);
      const update = () => this.fullScreenSig.set(query.matches);
      update();
      query.addEventListener("change", update);
      destroyRef.onDestroy(() => query.removeEventListener("change", update));
      if (query.matches) this.host.querySelector<HTMLElement>(".cat-cart-panel__header button")?.focus();
    });
    afterEveryRender(() => this.keepFocusInsideAtMaximum());
    destroyRef.onDestroy(() => this.restoreFocus());
  }

  protected onIncrease(item: CartSnapshot["lineItems"][number]): void {
    if (item.quantity + 1 >= MAX_LINE_ITEM_QUANTITY) this.maxReachedItemId = item.id;
    this.quantityChange.emit({ lineItemId: item.id, quantity: item.quantity + 1 });
  }

  /**
   * Escape closes the cart at every width. A modal <dialog> on top (the camera) owns its own
   * Escape, so keys from inside a dialog other than the one the widget itself sits in (a host may
   * mount it in its own <dialog>) are ignored. Escape while an IME composes belongs to the IME.
   */
  @HostListener("document:keydown", ["$event"])
  protected onDocumentKeyDown(event: KeyboardEvent): void {
    if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) return;
    const keyDialog = event.target instanceof Element ? event.target.closest("dialog") : null;
    if (keyDialog && keyDialog !== this.host.closest("dialog")) return;
    this.close.emit();
  }

  /** APG: while modal, Tab wraps from the last control to the first and Shift+Tab back. */
  protected onKeyDown(event: KeyboardEvent): void {
    if (event.key !== "Tab" || !this.fullScreenSig()) return;
    const section = event.currentTarget as HTMLElement;
    const controls = getFocusable(section);
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (!first || !last) return;
    const active = this.document.activeElement;
    if (event.shiftKey && (active === first || active === section)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private restoreFocus(): void {
    const active = this.document.activeElement;
    const lost = !active || active === this.document.body || this.host.contains(active);
    if (lost || this.fullScreenSig()) focusFirstAvailable(this.returnFocusTo, this.opener);
  }

  /**
   * After the mutation that took a line to the maximum, the disabled "+" cannot keep focus: move it
   * to that line's "-" so a keyboard user stays inside the panel.
   */
  private keepFocusInsideAtMaximum(): void {
    const itemId = this.maxReachedItemId;
    if (!itemId || this.isLoading) return;
    const item = this.cart?.lineItems.find((line) => line.id === itemId);
    if (!item || item.quantity < MAX_LINE_ITEM_QUANTITY) {
      // Still waiting for the mutation, unless it failed.
      if (!item || this.error) this.maxReachedItemId = null;
      return;
    }
    this.maxReachedItemId = null;
    const active = this.document.activeElement;
    if (active && active !== this.document.body && !(active as HTMLButtonElement).disabled) return;
    const row = Array.from(this.host.querySelectorAll<HTMLElement>("[data-line-item-id]")).find(
      (element) => element.dataset["lineItemId"] === itemId,
    );
    focusFirstAvailable(row?.querySelector(".cat-cart-item__qty-btn"));
  }

  get email(): string {
    return this.emailSig();
  }
  set email(value: string) {
    this.emailSig.set(value);
  }
  get password(): string {
    return this.passwordSig();
  }
  set password(value: string) {
    this.passwordSig.set(value);
  }
  get isAuthExpanded(): boolean {
    return this.isAuthExpandedSig();
  }
  set isAuthExpanded(value: boolean) {
    this.isAuthExpandedSig.set(value);
  }

  get isEmpty(): boolean {
    return !this.cart || this.cart.lineItems.length === 0;
  }

  /** The error text as given: it is already in the widget's language when it comes from the cart service. */
  get visibleError(): string | null {
    return this.error || null;
  }

  quantityLabel(item: CartSnapshot["lineItems"][number]): string {
    return quantityGroupLabel(this.messages, item.name);
  }

  removeLabel(item: CartSnapshot["lineItems"][number]): string {
    return removeItemLabel(this.messages, item.name);
  }

  lineTotal(item: CartSnapshot["lineItems"][number]): string | null {
    return formatLineTotal(item.price, item.quantity, this.catalogLocale);
  }

  onLoginSubmit(): void {
    this.login.emit({ email: this.email, password: this.password });
    this.password = "";
  }
}
