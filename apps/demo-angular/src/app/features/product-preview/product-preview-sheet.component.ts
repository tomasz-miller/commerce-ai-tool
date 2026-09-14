import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
  inject,
  signal,
} from "@angular/core";
import { CommerceAiCartService } from "@commerce-ai-tool/angular";
import type { ProductCard } from "@commerce-ai-tool/core/client";
import { DEMO_CONFIG } from "../../core/config/demo-config.js";
import {
  PREVIEW_MAX_QUANTITY,
  PREVIEW_MIN_QUANTITY,
  clampPreviewQuantity,
  formatSheetTotal,
} from "./product-preview.js";

@Component({
  selector: "app-product-preview-sheet",
  standalone: true,
  providers: [CommerceAiCartService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="demo-product-sheet"
      role="dialog"
      aria-modal="true"
      [attr.aria-labelledby]="titleId"
      tabindex="-1"
      (click)="close.emit()"
    >
      <div class="demo-product-sheet__bezel" (click)="$event.stopPropagation()">
        <div class="demo-product-sheet__core">
          @if (product.imageUrl) {
            <img [src]="product.imageUrl" alt="" class="demo-product-sheet__image" />
          } @else {
            <div class="demo-product-sheet__image--placeholder" aria-hidden="true">No image</div>
          }
          <div class="demo-product-sheet__header">
            <h2 [id]="titleId">{{ product.name }}</h2>
            @if (product.price) {
              <strong class="demo-product-sheet__price">{{ product.price.formatted }}</strong>
            }
          </div>
          @if (product.description) {
            <div class="demo-product-sheet__scroll">
              <p
                [id]="descriptionId"
                class="demo-product-sheet__description"
                [class.demo-product-sheet__description--clamped]="
                  product.description.length > descriptionExpandThreshold && !descriptionExpanded()
                "
              >
                {{ product.description }}
              </p>
              @if (product.description.length > descriptionExpandThreshold) {
                <button
                  type="button"
                  class="demo-product-sheet__toggle"
                  [attr.aria-expanded]="descriptionExpanded()"
                  [attr.aria-controls]="descriptionId"
                  (click)="descriptionExpanded.set(!descriptionExpanded())"
                >
                  {{ descriptionExpanded() ? "Show less" : "Show more" }}
                </button>
              }
            </div>
          }
          <div class="demo-product-sheet__footer">
            @if (product.sku) {
              <div class="demo-product-sheet__meta"><span>SKU {{ product.sku }}</span></div>
            }
            <div class="demo-product-sheet__purchase">
              <div class="demo-product-sheet__qty" role="group" [attr.aria-labelledby]="quantityId">
                <span [id]="quantityId" class="demo-product-sheet__qty-label">Quantity</span>
                <div class="demo-product-sheet__qty-controls">
                  <button
                    type="button"
                    class="demo-product-sheet__qty-btn"
                    aria-label="Decrease quantity"
                    [disabled]="quantity() <= minQuantity || cart.isMutating()"
                    (click)="changeQuantity(-1)"
                  >
                    −
                  </button>
                  <span class="demo-product-sheet__qty-value" aria-live="polite">{{ quantity() }}</span>
                  <button
                    type="button"
                    class="demo-product-sheet__qty-btn"
                    aria-label="Increase quantity"
                    [disabled]="quantity() >= maxQuantity || cart.isMutating()"
                    (click)="changeQuantity(1)"
                  >
                    +
                  </button>
                </div>
              </div>
              <button
                type="button"
                class="demo-product-sheet__add"
                [disabled]="cart.isMutating()"
                (click)="addToCart()"
              >
                {{ addLabel() }}
              </button>
              <button #closeButton type="button" class="demo-product-sheet__close" (click)="close.emit()">
                Close
              </button>
            </div>
            @if (justAdded()) {
              <p class="demo-product-sheet__feedback" role="status">
                Added {{ quantity() }} {{ quantity() === 1 ? "item" : "items" }} to your cart.
              </p>
            }
            @if (addError()) {
              <p class="demo-product-sheet__error" role="alert">{{ addError() }}</p>
            }
          </div>
        </div>
      </div>
    </div>
  `,
})
export class ProductPreviewSheetComponent implements OnInit, AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) product!: ProductCard;
  @Output() close = new EventEmitter<void>();

  @ViewChild("closeButton") closeButton?: ElementRef<HTMLButtonElement>;

  protected readonly cart = inject(CommerceAiCartService);
  private readonly config = inject(DEMO_CONFIG);

  protected readonly quantity = signal(1);
  protected readonly justAdded = signal(false);
  protected readonly addError = signal<string | null>(null);
  protected readonly descriptionExpanded = signal(false);
  protected readonly descriptionExpandThreshold = 200;
  protected readonly minQuantity = PREVIEW_MIN_QUANTITY;
  protected readonly maxQuantity = PREVIEW_MAX_QUANTITY;
  protected readonly titleId = "demo-preview-title";
  protected readonly descriptionId = "demo-preview-description";
  protected readonly quantityId = "demo-preview-quantity";
  private previousOverflow = "";

  ngOnInit(): void {
    this.previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    this.cart.configure({
      apiBaseUrl: this.config.apiBaseUrl,
      currency: this.config.currency,
      country: this.config.country,
      catalogLocale: this.config.catalogLocale,
      enabled: true,
    });
  }

  ngAfterViewInit(): void {
    this.closeButton?.nativeElement.focus();
  }

  ngOnDestroy(): void {
    document.body.style.overflow = this.previousOverflow;
  }

  ngOnChanges(): void {
    this.quantity.set(1);
    this.justAdded.set(false);
    this.addError.set(null);
    this.descriptionExpanded.set(false);
  }

  @HostListener("document:keydown.escape")
  onEscape(): void {
    this.close.emit();
  }

  protected changeQuantity(delta: number): void {
    this.justAdded.set(false);
    this.addError.set(null);
    this.quantity.set(clampPreviewQuantity(this.quantity() + delta));
  }

  protected addLabel(): string {
    if (this.cart.isMutating()) {
      return "Adding…";
    }
    if (this.justAdded()) {
      return "Added to cart";
    }
    const price = this.product.price;
    return price
      ? `Add to cart · ${formatSheetTotal(price, this.quantity(), this.config.catalogLocale)}`
      : "Add to cart";
  }

  protected async addToCart(): Promise<void> {
    if (this.cart.isMutating()) {
      return;
    }
    this.addError.set(null);
    const result = this.product.sku
      ? await this.cart.addToCart({ sku: this.product.sku, quantity: this.quantity() })
      : await this.cart.addToCart({
          productId: this.product.id,
          variantId: this.product.variantId,
          quantity: this.quantity(),
        });
    if (result) {
      this.justAdded.set(true);
    } else {
      this.addError.set("Could not add this product to the cart.");
    }
  }
}
