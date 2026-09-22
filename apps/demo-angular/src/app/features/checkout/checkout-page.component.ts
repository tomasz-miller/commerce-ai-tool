import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Router, RouterLink } from "@angular/router";
import type { CheckoutAddress } from "@commerce-ai-tool/core/client";
import { CheckoutApiService } from "../../core/api/checkout-api.service.js";
import { DEMO_CONFIG } from "../../core/config/demo-config.js";
import { CheckoutFacade } from "../../core/checkout/checkout.facade.js";
import {
  createEmptyAddress,
  isAddressComplete,
} from "../../core/checkout/checkout-address.js";
import { ErrorBannerComponent } from "../../shared/ui/error-banner.component.js";
import { LoadingSpinnerComponent } from "../../shared/ui/loading-spinner.component.js";
import { AddressFieldsComponent } from "./address-fields.component.js";
import { OrderSummaryComponent } from "./order-summary.component.js";
import { PaymentStepComponent } from "./payment-step.component.js";
import { ShippingStepComponent } from "./shipping-step.component.js";

@Component({
  selector: "app-checkout-page",
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    AddressFieldsComponent,
    ErrorBannerComponent,
    LoadingSpinnerComponent,
    OrderSummaryComponent,
    PaymentStepComponent,
    ShippingStepComponent,
  ],
  providers: [CheckoutFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!api.cart()) {
      <main id="main" class="demo-page cat-root" data-theme="light">
        <section class="cat-checkout__empty cat-checkout__bezel">
          <div class="cat-checkout__core">
            @if (api.isLoading()) {
              <app-loading-spinner>Loading your cart…</app-loading-spinner>
            } @else {
              <h1>Your cart is empty</h1>
              <a class="cat-checkout__back" [routerLink]="['/']">Continue shopping</a>
            }
          </div>
        </section>
      </main>
    } @else {
      <main id="main" class="demo-page cat-root cat-checkout" data-theme="light">
        <header class="cat-checkout__intro">
          <p class="cat-checkout__eyebrow">Checkout</p>
          <h1>Checkout</h1>
          <ol class="cat-checkout__steps">
            <li
              class="cat-checkout__step"
              [class.cat-checkout__step--current]="!facade.addressesSaved()"
              [attr.aria-current]="!facade.addressesSaved() ? 'step' : undefined"
            >
              Address
            </li>
            <li
              class="cat-checkout__step"
              [class.cat-checkout__step--current]="facade.addressesSaved()"
              [attr.aria-current]="
                facade.addressesSaved() && !facade.paymentRequired() ? 'step' : undefined
              "
            >
              Delivery
            </li>
            @if (facade.paymentRequired()) {
              <li
                class="cat-checkout__step"
                [class.cat-checkout__step--current]="facade.addressesSaved()"
                [attr.aria-current]="facade.addressesSaved() ? 'step' : undefined"
              >
                Payment
              </li>
            }
          </ol>
        </header>

        <app-error-banner [message]="api.error()" />

        <div class="cat-checkout__layout">
          @if (api.cart(); as cart) {
            <app-order-summary [cart]="cart" />
          }

          <div class="cat-checkout__flow">
            <form class="cat-checkout__bezel" (ngSubmit)="saveAddresses()">
              <div class="cat-checkout__core">
                <div class="cat-checkout__section-heading">
                  <h2>Shipping address</h2>
                </div>
                <app-address-fields
                  prefix="shipping"
                  [address]="shippingAddress()"
                  (addressChange)="shippingAddress.set($event)"
                />
                <label class="cat-checkout__checkbox">
                  <input
                    type="checkbox"
                    name="billingMatchesShipping"
                    [ngModel]="billingMatchesShipping()"
                    (ngModelChange)="billingMatchesShipping.set($event)"
                  />
                  <span>Billing address matches shipping address</span>
                </label>
                @if (!billingMatchesShipping()) {
                  <div class="cat-checkout__billing">
                    <h3>Billing address</h3>
                    <app-address-fields
                      prefix="billing"
                      [address]="billingAddress()"
                      (addressChange)="billingAddress.set($event)"
                    />
                  </div>
                }
                <button
                  class="cat-checkout__secondary"
                  type="submit"
                  [disabled]="busy() || !addressesValid()"
                >
                  Continue to delivery
                </button>
              </div>
            </form>

            @if (facade.addressesSaved()) {
              <app-shipping-step
                [methods]="facade.shippingMethods()"
                [selectedId]="facade.selectedShippingMethodId()"
                [disabled]="busy()"
                (selected)="selectShipping($event)"
              />
            }

            @if (facade.shippingReady() && facade.paymentRequired()) {
              <app-payment-step
                [methods]="facade.paymentMethods()"
                [selectedMethod]="facade.selectedPaymentMethod()"
                [authorizedPayment]="facade.authorizedPayment()"
                [disabled]="busy()"
                (selected)="selectPayment($event)"
              />
            }
          </div>
        </div>

        <div class="cat-checkout__place-island">
          <button
            type="button"
            class="cat-checkout-cta"
            [disabled]="!facade.canPlaceOrder() || busy()"
            (click)="placeOrder()"
          >
            <span>{{ busy() ? "Placing order…" : "Place order" }}</span>
          </button>
          @if (placeOrderHint(); as hint) {
            <p id="cat-checkout-place-hint" class="cat-checkout__place-hint">{{ hint }}</p>
          }
        </div>
      </main>
    }
  `,
})
export class CheckoutPageComponent implements OnInit {
  protected readonly api = inject(CheckoutApiService);
  protected readonly facade = inject(CheckoutFacade);
  private readonly config = inject(DEMO_CONFIG);
  private readonly router = inject(Router);

  protected readonly shippingAddress = signal<CheckoutAddress>(
    createEmptyAddress(this.config.country),
  );
  protected readonly billingAddress = signal<CheckoutAddress>(
    createEmptyAddress(this.config.country),
  );
  protected readonly billingMatchesShipping = signal(true);
  protected readonly placingOrder = signal(false);

  protected readonly addressesValid = computed(() => {
    if (!isAddressComplete(this.shippingAddress())) {
      return false;
    }
    return this.billingMatchesShipping() || isAddressComplete(this.billingAddress());
  });

  protected readonly busy = computed(
    () => this.facade.isBusy() || this.api.isMutating() || this.placingOrder(),
  );

  protected readonly placeOrderHint = computed(() => {
    if (this.facade.canPlaceOrder()) {
      return null;
    }
    if (!this.facade.addressesSaved()) {
      return "Complete the address form to continue.";
    }
    if (this.facade.shippingMethods().length > 0 && !this.facade.selectedShippingMethodId()) {
      return "Select a delivery method to continue.";
    }
    if (this.facade.paymentRequired() && !this.facade.paymentReady()) {
      return "Select a payment method to continue.";
    }
    return null;
  });

  ngOnInit(): void {
    this.api.configure({
      apiBaseUrl: this.config.apiBaseUrl,
      currency: this.config.currency,
      country: this.config.country,
      catalogLocale: this.config.catalogLocale,
    });
  }

  protected async saveAddresses(): Promise<void> {
    if (!this.addressesValid()) {
      return;
    }
    await this.facade.saveAddresses(
      this.shippingAddress(),
      this.billingMatchesShipping() ? undefined : this.billingAddress(),
    );
  }

  protected async selectShipping(shippingMethodId: string): Promise<void> {
    await this.facade.selectShippingMethod(shippingMethodId);
  }

  protected async selectPayment(method: string): Promise<void> {
    await this.facade.selectPaymentMethod(method);
  }

  protected async placeOrder(): Promise<void> {
    if (!this.facade.canPlaceOrder()) {
      return;
    }
    this.placingOrder.set(true);
    try {
      const placed = await this.facade.placeOrder();
      if (placed) {
        void this.router.navigate(["/orders"], {
          queryParams: { orderNumber: placed.orderNumber ?? placed.id },
        });
      }
    } finally {
      this.placingOrder.set(false);
    }
  }
}
