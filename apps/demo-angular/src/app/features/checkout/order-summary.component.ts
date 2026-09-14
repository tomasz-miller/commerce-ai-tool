import { ChangeDetectionStrategy, Component, Input } from "@angular/core";
import type { CartSnapshot } from "@commerce-ai-tool/core/client";

@Component({
  selector: "app-order-summary",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="cat-checkout__bezel cat-checkout__summary">
      <div class="cat-checkout__core">
        <div class="cat-checkout__section-heading">
          <h2>Order summary</h2>
        </div>
        <ul class="cat-checkout__items">
          @for (item of cart.lineItems; track item.id) {
            <li class="cat-checkout__item">
              <span class="cat-checkout__item-copy">
                @if (item.imageUrl) {
                  <img [src]="item.imageUrl" alt="" class="cat-checkout__item-image" />
                }
                <span>
                  {{ item.name }}
                  <small>× {{ item.quantity }}</small>
                </span>
              </span>
              <strong>{{ item.price?.formatted ?? "—" }}</strong>
            </li>
          }
        </ul>
        <div class="cat-checkout__summary-total">
          <span>Total</span>
          <strong>{{ cart.totalPrice.formatted }}</strong>
        </div>
      </div>
    </section>
  `,
})
export class OrderSummaryComponent {
  @Input({ required: true }) cart!: CartSnapshot;
}
