import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from "@angular/core";
import type { PaymentMethodOption, PaymentSnapshot } from "@commerce-ai-tool/core/client";

@Component({
  selector: "app-payment-step",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="cat-checkout__bezel">
      <div class="cat-checkout__core">
        <div class="cat-checkout__section-heading">
          <h2>Payment</h2>
        </div>
        <div class="cat-checkout__shipping-methods" aria-label="Select a payment method">
          @for (method of methods; track method.method) {
            <button
              type="button"
              class="cat-checkout__shipping-card"
              [class.cat-checkout__shipping-card--selected]="selectedMethod === method.method"
              [disabled]="disabled"
              [attr.aria-pressed]="selectedMethod === method.method"
              (click)="selected.emit(method.method)"
            >
              <span class="cat-checkout__shipping-copy">
                <strong>{{ method.name }}</strong>
                @if (method.description) {
                  <small>{{ method.description }}</small>
                }
              </span>
              <span class="cat-checkout__shipping-price">
                @if (isAuthorized(method.method)) {
                  Authorized
                }
              </span>
            </button>
          }
        </div>
      </div>
    </section>
  `,
})
export class PaymentStepComponent {
  @Input() methods: PaymentMethodOption[] = [];
  @Input() selectedMethod = "";
  @Input() authorizedPayment: PaymentSnapshot | null = null;
  @Input() disabled = false;
  @Output() selected = new EventEmitter<string>();

  protected isAuthorized(method: string): boolean {
    return (
      this.authorizedPayment?.status === "authorized" &&
      this.authorizedPayment.method === method
    );
  }
}
