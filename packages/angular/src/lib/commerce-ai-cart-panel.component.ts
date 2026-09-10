import { Component, EventEmitter, Input, Output } from "@angular/core";
import { FormsModule } from "@angular/forms";
import type {
  CartSnapshot,
  CommerceAISearchMessages,
  CustomerSnapshot,
} from "@commerce-ai-tool/core/client";

export function displayCartError(
  error: string | null,
  messages: CommerceAISearchMessages,
): string | null {
  if (!error) {
    return null;
  }
  if (error === "Invalid credentials") {
    return messages.invalidCredentials;
  }
  if (error === "Sign in failed" || error === "Login failed") {
    return messages.signInFailed;
  }
  return error;
}

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
  imports: [FormsModule],
  template: `
    <section
      class="cat-cart-panel"
      [class.cat-cart-panel--with-items]="!isEmpty"
      [attr.aria-label]="messages.cartAriaLabel"
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
            <li class="cat-cart-item">
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
                <div class="cat-cart-item__qty">
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
                  <span class="cat-cart-item__qty-value">{{ item.quantity }}</span>
                  <button
                    type="button"
                    class="cat-cart-item__qty-btn"
                    [attr.aria-label]="messages.increaseQuantity"
                    [disabled]="isLoading"
                    (click)="quantityChange.emit({ lineItemId: item.id, quantity: item.quantity + 1 })"
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
                [attr.aria-label]="messages.removeItem"
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
            [attr.aria-expanded]="isAuthExpanded"
            (click)="isAuthExpanded = !isAuthExpanded"
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
              [class.cat-cart-panel__auth-chevron--open]="isAuthExpanded"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          @if (isAuthExpanded) {
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
                  [(ngModel)]="email"
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
                  [(ngModel)]="password"
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
  @Input({ required: true }) messages!: CommerceAISearchMessages;
  @Input() catalogLocale?: string;
  @Input() showCheckout = false;

  @Output() close = new EventEmitter<void>();
  @Output() remove = new EventEmitter<string>();
  @Output() quantityChange = new EventEmitter<{ lineItemId: string; quantity: number }>();
  @Output() login = new EventEmitter<{ email: string; password: string }>();
  @Output() logout = new EventEmitter<void>();
  @Output() checkout = new EventEmitter<CartSnapshot>();

  email = "";
  password = "";
  isAuthExpanded = false;

  get isEmpty(): boolean {
    return !this.cart || this.cart.lineItems.length === 0;
  }

  get visibleError(): string | null {
    return displayCartError(this.error, this.messages);
  }

  lineTotal(item: CartSnapshot["lineItems"][number]): string | null {
    return formatLineTotal(item.price, item.quantity, this.catalogLocale);
  }

  onLoginSubmit(): void {
    this.login.emit({ email: this.email, password: this.password });
    this.password = "";
  }
}
