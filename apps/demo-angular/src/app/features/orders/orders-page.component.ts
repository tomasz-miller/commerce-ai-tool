import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  inject,
  signal,
} from "@angular/core";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { Subscription } from "rxjs";
import type { OrderSnapshot } from "@commerce-ai-tool/core/client";
import { CheckoutApiService } from "../../core/api/checkout-api.service.js";
import { DEMO_CONFIG } from "../../core/config/demo-config.js";
import { formatOrderAddress, formatPlacedAt } from "../../core/orders/order-format.js";
import { ErrorBannerComponent } from "../../shared/ui/error-banner.component.js";
import { LoadingSpinnerComponent } from "../../shared/ui/loading-spinner.component.js";

@Component({
  selector: "app-orders-page",
  standalone: true,
  imports: [RouterLink, ErrorBannerComponent, LoadingSpinnerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main id="main" class="demo-page cat-root cat-checkout" data-theme="dark">
      @if (!loaded()) {
        <section class="cat-checkout__empty cat-checkout__bezel">
          <div class="cat-checkout__core">
            <app-loading-spinner>Loading orders…</app-loading-spinner>
          </div>
        </section>
      } @else if (orderNumber()) {
        @if (order(); as current) {
          <header class="cat-checkout__intro">
            <p class="cat-checkout__eyebrow">Order status</p>
            <h1>{{ current.orderNumber ?? current.id }}</h1>
            <div class="cat-order-status__badges">
              @if (current.orderState) {
                <span class="cat-order-status__badge">
                  <small>Status</small>
                  {{ current.orderState }}
                </span>
              }
              @if (current.paymentState) {
                <span class="cat-order-status__badge">
                  <small>Payment</small>
                  {{ current.paymentState }}
                </span>
              }
              @if (current.shipmentState) {
                <span class="cat-order-status__badge">
                  <small>Shipment</small>
                  {{ current.shipmentState }}
                </span>
              }
            </div>
            @if (current.createdAt) {
              <p class="cat-order-status__placed">
                Placed {{ placedAt(current.createdAt) }}
              </p>
            }
          </header>

          <app-error-banner [message]="api.error()" />

          <div class="cat-checkout__layout">
            <section class="cat-checkout__bezel cat-checkout__summary">
              <div class="cat-checkout__core">
                <div class="cat-checkout__section-heading">
                  <h2>Order summary</h2>
                </div>
                <ul class="cat-checkout__items">
                  @for (item of current.lineItems; track item.id) {
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
                      <strong>{{ item.totalPrice?.formatted ?? item.price?.formatted ?? "—" }}</strong>
                    </li>
                  }
                </ul>
                <div class="cat-checkout__summary-total">
                  <span>Total</span>
                  <strong>{{ current.totalPrice.formatted }}</strong>
                </div>
              </div>
            </section>

            <div class="cat-checkout__flow">
              @if (current.shippingAddress) {
                <section class="cat-checkout__bezel">
                  <div class="cat-checkout__core">
                    <h2>Shipping address</h2>
                    <p class="cat-order-status__copy">{{ addressOf(current) }}</p>
                    @if (current.shippingMethod) {
                      <p class="cat-order-status__copy">{{ current.shippingMethod.name }}</p>
                    }
                  </div>
                </section>
              }
              <section class="cat-checkout__bezel">
                <div class="cat-checkout__core">
                  <div class="cat-checkout__section-heading">
                    <h2>Tracking</h2>
                  </div>
                  @if (current.deliveries?.length) {
                    <ul class="cat-order-status__tracking">
                      @for (delivery of current.deliveries; track delivery.id) {
                        <li>
                          <strong>Tracking number</strong>
                          <span>{{ delivery.trackingId ?? "—" }}</span>
                          @if (delivery.carrier) {
                            <small>Carrier: {{ delivery.carrier }}</small>
                          }
                        </li>
                      }
                    </ul>
                  } @else {
                    <p class="cat-checkout__empty-methods">No tracking information yet.</p>
                  }
                </div>
              </section>
            </div>
          </div>
        } @else {
          <section class="cat-checkout__empty cat-checkout__bezel">
            <div class="cat-checkout__core">
              <h1>Order not found</h1>
              <a class="cat-checkout__back" [routerLink]="['/']">Continue shopping</a>
            </div>
          </section>
        }
      } @else {
        @if (orders().length === 0) {
          <section class="cat-checkout__empty cat-checkout__bezel">
            <div class="cat-checkout__core">
              <h1>No orders yet</h1>
              <a class="cat-checkout__back" [routerLink]="['/']">Continue shopping</a>
            </div>
          </section>
        } @else {
          <header class="cat-checkout__intro">
            <p class="cat-checkout__eyebrow">Order status</p>
            <h1>Your orders</h1>
          </header>
          <app-error-banner [message]="api.error()" />
          <section class="cat-checkout__bezel cat-checkout__summary">
            <div class="cat-checkout__core">
              <ul class="cat-order-status__list">
                @for (item of orders(); track item.id) {
                  <li>
                    <a
                      class="cat-order-status__list-link"
                      [routerLink]="['/orders']"
                      [queryParams]="{ orderNumber: item.orderNumber ?? item.id }"
                    >
                      <span class="cat-order-status__list-copy">
                        <strong>{{ item.orderNumber ?? item.id }}</strong>
                        @if (item.createdAt) {
                          <small>{{ placedAt(item.createdAt) }}</small>
                        }
                      </span>
                      <span class="cat-order-status__list-meta">
                        @if (item.orderState) {
                          <small>{{ item.orderState }}</small>
                        }
                        <strong>{{ item.totalPrice.formatted }}</strong>
                      </span>
                    </a>
                  </li>
                }
              </ul>
            </div>
          </section>
        }
      }

      <a class="cat-checkout__back" [routerLink]="['/']">Continue shopping</a>
    </main>
  `,
})
export class OrdersPageComponent implements OnInit, OnDestroy {
  protected readonly api = inject(CheckoutApiService);
  private readonly config = inject(DEMO_CONFIG);
  private readonly route = inject(ActivatedRoute);
  private subscription: Subscription | null = null;

  protected readonly orderNumber = signal("");
  protected readonly order = signal<OrderSnapshot | null>(null);
  protected readonly orders = signal<OrderSnapshot[]>([]);
  protected readonly loaded = signal(false);

  ngOnInit(): void {
    this.api.configure({
      apiBaseUrl: this.config.apiBaseUrl,
      currency: this.config.currency,
      country: this.config.country,
      catalogLocale: this.config.catalogLocale,
    });
    this.subscription = this.route.queryParamMap.subscribe((params) => {
      void this.load(params.get("orderNumber") ?? "");
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  protected placedAt(iso: string): string {
    return formatPlacedAt(iso);
  }

  protected addressOf(order: OrderSnapshot): string {
    return order.shippingAddress ? formatOrderAddress(order.shippingAddress) : "";
  }

  private async load(orderNumber: string): Promise<void> {
    this.loaded.set(false);
    this.order.set(null);
    this.orders.set([]);
    this.orderNumber.set(orderNumber.trim());
    if (this.orderNumber()) {
      this.order.set(await this.api.getOrder(this.orderNumber()));
    } else {
      this.orders.set(await this.api.listOrders());
    }
    this.loaded.set(true);
  }
}
