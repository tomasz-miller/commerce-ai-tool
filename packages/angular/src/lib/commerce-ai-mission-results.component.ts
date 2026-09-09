import { NgTemplateOutlet } from "@angular/common";
import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output } from "@angular/core";
import type {
  AddToCartLineItem,
  CommerceAISearchMessages,
  MissionSearchResult,
  ProductCard,
} from "@commerce-ai-tool/core";
import { formatMissionAddAll, starterBundleItems } from "./mission.util.js";

let missionTitleCounter = 0;

@Component({
  selector: "commerce-ai-mission-results",
  standalone: true,
  imports: [NgTemplateOutlet],
  template: `
    <div class="cat-mission">
      <div class="cat-mission__header">
        <h2 [id]="titleId" class="cat-mission__title">{{ messages.missionTitle }}</h2>
        @if (mission.interpretation) {
          <p class="cat-mission__interpretation">{{ mission.interpretation }}</p>
        }
      </div>

      <div class="cat-mission__lanes" role="list" [attr.aria-labelledby]="titleId">
        @for (group of mission.intents; track group.intent.id) {
          <section class="cat-mission-group" role="listitem">
            <div class="cat-mission-group__header">
              <h3 class="cat-mission-group__label">{{ group.intent.label }}</h3>
              @if (group.intent.quantity > 1) {
                <span class="cat-mission-group__qty">
                  {{ messages.missionQuantity }} {{ group.intent.quantity }}
                </span>
              }
            </div>

            @if (group.failed) {
              <div class="cat-status cat-status--empty" role="status">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                  <path d="m13 9-4 4" />
                  <path d="m9 9 4 4" />
                </svg>
                <div class="cat-status__content">
                  <div class="cat-status__title">{{ messages.missionIntentFailed }}</div>
                </div>
              </div>
            } @else if (group.products.length === 0) {
              <div class="cat-status cat-status--empty" role="status">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                  <path d="m13 9-4 4" />
                  <path d="m9 9 4 4" />
                </svg>
                <div class="cat-status__content">
                  <div class="cat-status__title">{{ messages.missionIntentEmpty }}</div>
                </div>
              </div>
            } @else {
              <div class="cat-mission-group__products">
                @for (product of group.products; track product.id; let index = $index) {
                  <article
                    class="cat-result-card"
                    [class.cat-result-card--primary]="index === 0"
                    [class.cat-result-card--compact]="index !== 0"
                  >
                    <div class="cat-result-card__core">
                      @if (productSelect.observed) {
                        <button type="button" class="cat-result-card__select" (click)="productSelect.emit(product)">
                          <ng-container [ngTemplateOutlet]="cardBody" [ngTemplateOutletContext]="{ $implicit: product }" />
                        </button>
                      } @else {
                        <div class="cat-result-card__select">
                          <ng-container [ngTemplateOutlet]="cardBody" [ngTemplateOutletContext]="{ $implicit: product }" />
                        </div>
                      }
                      @if (enableCart) {
                        <button
                          type="button"
                          class="cat-icon-btn cat-result-card__add"
                          [class.cat-result-card__add--added]="addedProductIds[product.id]"
                          [attr.aria-label]="addLabel(product)"
                          [disabled]="!(product.sku || product.id) || isMutating"
                          (click)="addItem.emit(product)"
                        >
                          @if (addedProductIds[product.id]) {
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                              <path d="M20 6 9 17l-5-5" />
                            </svg>
                          } @else {
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                              <circle cx="8" cy="21" r="1" />
                              <circle cx="19" cy="21" r="1" />
                              <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
                            </svg>
                          }
                        </button>
                      }
                    </div>
                  </article>
                }
              </div>
            }
          </section>
        }
      </div>

      @if (enableCart) {
        <div class="cat-mission__footer">
          <button
            type="button"
            class="cat-checkout-cta cat-mission__add-all"
            [class.cat-mission__add-all--added]="justAddedAll"
            [disabled]="isMutating || bundleItems.length === 0"
            (click)="onAddAllClick()"
          >
            {{ justAddedAll ? messages.missionItemsAdded : addAllLabel }}
          </button>
        </div>
      }
    </div>

    <ng-template #cardBody let-product>
      @if (product.imageUrl) {
        <img [src]="product.imageUrl" alt="" class="cat-result-image" loading="lazy" />
      } @else {
        <div class="cat-result-image cat-result-image--placeholder">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M16.5 9.4 7.55 4.24" />
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.29 7 12 12 20.71 7" />
            <line x1="12" x2="12" y1="22" y2="12" />
          </svg>
        </div>
      }
      <div class="cat-result-info">
        <div class="cat-result-name">{{ product.name }}</div>
        @if (product.price) {
          <div class="cat-result-price">{{ product.price.formatted }}</div>
        }
      </div>
    </ng-template>
  `,
})
export class CommerceAiMissionResultsComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) mission!: MissionSearchResult;
  @Input({ required: true }) messages!: CommerceAISearchMessages;
  @Input() enableCart = false;
  @Input() isMutating = false;
  @Input() addedProductIds: Record<string, true> = {};
  @Input() addAllHandler?: (items: AddToCartLineItem[]) => Promise<unknown>;

  @Output() productSelect = new EventEmitter<ProductCard>();
  @Output() addItem = new EventEmitter<ProductCard>();
  @Output() addAll = new EventEmitter<AddToCartLineItem[]>();

  readonly titleId = `cat-mission-title-${(missionTitleCounter += 1)}`;
  justAddedAll = false;
  private addedAllTimeout: ReturnType<typeof setTimeout> | null = null;
  private lastMission: MissionSearchResult | null = null;
  private cachedBundleMission: MissionSearchResult | null = null;
  private cachedBundleItems: AddToCartLineItem[] = [];

  get bundleItems(): AddToCartLineItem[] {
    if (this.cachedBundleMission !== this.mission) {
      this.cachedBundleMission = this.mission;
      this.cachedBundleItems = starterBundleItems(this.mission);
    }
    return this.cachedBundleItems;
  }

  get addAllLabel(): string {
    const totalQuantity = this.bundleItems.reduce((sum, item) => sum + (item.quantity ?? 1), 0);
    return formatMissionAddAll(this.messages.missionAddAll, totalQuantity);
  }

  ngOnChanges(): void {
    if (this.mission !== this.lastMission) {
      this.lastMission = this.mission;
      this.justAddedAll = false;
    }
  }

  ngOnDestroy(): void {
    if (this.addedAllTimeout) {
      clearTimeout(this.addedAllTimeout);
      this.addedAllTimeout = null;
    }
  }

  addLabel(product: ProductCard): string {
    if (this.addedProductIds[product.id]) {
      return this.messages.itemAdded;
    }
    return product.sku || product.id ? this.messages.addToCart : this.messages.unableToAddToCart;
  }

  onAddAllClick(): void {
    const items = this.bundleItems;
    this.addAll.emit(items);
    void this.addAllHandler?.(items).then((result) => {
      if (!result) {
        return;
      }
      this.justAddedAll = true;
      if (this.addedAllTimeout) {
        clearTimeout(this.addedAllTimeout);
      }
      this.addedAllTimeout = setTimeout(() => {
        this.justAddedAll = false;
        this.addedAllTimeout = null;
      }, 1200);
    });
  }
}
