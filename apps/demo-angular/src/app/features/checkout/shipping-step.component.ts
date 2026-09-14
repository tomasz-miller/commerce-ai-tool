import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from "@angular/core";
import type { ShippingMethodSnapshot } from "@commerce-ai-tool/core/client";

@Component({
  selector: "app-shipping-step",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="cat-checkout__bezel">
      <div class="cat-checkout__core">
        <div class="cat-checkout__section-heading">
          <h2>Delivery</h2>
        </div>
        @if (methods.length > 0) {
          <div class="cat-checkout__shipping-methods" aria-label="Select a delivery method">
            @for (method of methods; track method.id) {
              <button
                type="button"
                class="cat-checkout__shipping-card"
                [class.cat-checkout__shipping-card--selected]="selectedId === method.id"
                [disabled]="disabled"
                [attr.aria-pressed]="selectedId === method.id"
                (click)="selected.emit(method.id)"
              >
                <span class="cat-checkout__shipping-copy">
                  <strong>{{ method.name }}</strong>
                  @if (method.description) {
                    <small>{{ method.description }}</small>
                  }
                </span>
                <span class="cat-checkout__shipping-price">{{ method.price?.formatted ?? "" }}</span>
              </button>
            }
          </div>
        } @else {
          <p class="cat-checkout__empty-methods">No delivery methods match this address.</p>
        }
      </div>
    </section>
  `,
})
export class ShippingStepComponent {
  @Input() methods: ShippingMethodSnapshot[] = [];
  @Input() selectedId = "";
  @Input() disabled = false;
  @Output() selected = new EventEmitter<string>();
}
