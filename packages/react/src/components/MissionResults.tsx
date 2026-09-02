import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, Package, SearchX, ShoppingCart } from "lucide-react";
import type {
  AddToCartLineItem,
  CommerceAISearchMessages,
  MissionSearchResult,
  ProductCard,
} from "@commerce-ai-tool/core";
import { ICON_STROKE } from "../icons.js";

export interface MissionResultsProps {
  mission: MissionSearchResult;
  messages: CommerceAISearchMessages;
  enableCart: boolean;
  isMutating: boolean;
  addedProductIds?: Record<string, true>;
  onProductSelect?: (product: ProductCard) => void;
  onAddItem?: (product: ProductCard) => void;
  onAddAll: (items: AddToCartLineItem[]) => Promise<unknown>;
}

function toCartItem(product: ProductCard, quantity: number): AddToCartLineItem {
  return product.sku
    ? { sku: product.sku, quantity }
    : { productId: product.id, variantId: product.variantId, quantity };
}

function lineItemKey(item: AddToCartLineItem): string {
  if (item.sku) {
    return `sku:${item.sku}`;
  }
  return `id:${item.productId ?? ""}:${item.variantId ?? ""}`;
}

function starterBundleItems(mission: MissionSearchResult): AddToCartLineItem[] {
  const items: AddToCartLineItem[] = [];
  const seen = new Set<string>();
  for (const group of mission.intents) {
    if (group.failed) {
      continue;
    }
    const product = group.products[0];
    if (!product || (!product.sku && !product.id)) {
      continue;
    }
    const item = toCartItem(product, 1);
    const key = lineItemKey(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    items.push(item);
  }
  return items;
}

function ProductCardBody({ product }: { product: ProductCard }) {
  return (
    <>
      {product.imageUrl ? (
        <img src={product.imageUrl} alt="" className="cat-result-image" loading="lazy" />
      ) : (
        <div className="cat-result-image cat-result-image--placeholder">
          <Package size={20} strokeWidth={ICON_STROKE} color="var(--cat-text-muted)" />
        </div>
      )}
      <div className="cat-result-info">
        <div className="cat-result-name">{product.name}</div>
        {product.price ? <div className="cat-result-price">{product.price.formatted}</div> : null}
      </div>
    </>
  );
}

export function MissionResults({
  mission,
  messages,
  enableCart,
  isMutating,
  addedProductIds,
  onProductSelect,
  onAddItem,
  onAddAll,
}: MissionResultsProps) {
  const titleId = useId();
  const [justAddedAll, setJustAddedAll] = useState(false);
  const addedAllTimeoutRef = useRef<number | null>(null);
  const bundleItems = useMemo(() => starterBundleItems(mission), [mission]);
  const totalQuantity = bundleItems.reduce((sum, item) => sum + (item.quantity ?? 1), 0);

  useEffect(() => {
    setJustAddedAll(false);
  }, [mission]);

  useEffect(() => {
    return () => {
      if (addedAllTimeoutRef.current !== null) {
        window.clearTimeout(addedAllTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="cat-mission">
      <div className="cat-mission__header">
        <h2 id={titleId} className="cat-mission__title">
          {messages.missionTitle}
        </h2>
        {mission.interpretation ? (
          <p className="cat-mission__interpretation">{mission.interpretation}</p>
        ) : null}
      </div>

      <div className="cat-mission__lanes" role="list" aria-labelledby={titleId}>
        {mission.intents.map((group) => (
          <section key={group.intent.id} className="cat-mission-group" role="listitem">
            <div className="cat-mission-group__header">
              <h3 className="cat-mission-group__label">{group.intent.label}</h3>
              {group.intent.quantity > 1 ? (
                <span className="cat-mission-group__qty">
                  {messages.missionQuantity} {group.intent.quantity}
                </span>
              ) : null}
            </div>

            {group.failed ? (
              <div className="cat-status cat-status--empty" role="status">
                <SearchX size={18} strokeWidth={ICON_STROKE} aria-hidden="true" />
                <div className="cat-status__content">
                  <div className="cat-status__title">{messages.missionIntentFailed}</div>
                </div>
              </div>
            ) : group.products.length === 0 ? (
              <div className="cat-status cat-status--empty" role="status">
                <SearchX size={18} strokeWidth={ICON_STROKE} aria-hidden="true" />
                <div className="cat-status__content">
                  <div className="cat-status__title">{messages.missionIntentEmpty}</div>
                </div>
              </div>
            ) : (
              <div className="cat-mission-group__products">
                {group.products.map((product) => {
                  const canAdd = Boolean(product.sku || product.id);
                  const justAdded = Boolean(addedProductIds?.[product.id]);
                  const body = <ProductCardBody product={product} />;
                  return (
                    <article key={product.id} className="cat-result-card">
                      <div className="cat-result-card__core">
                        {onProductSelect ? (
                          <button
                            type="button"
                            className="cat-result-card__select"
                            onClick={() => onProductSelect(product)}
                          >
                            {body}
                          </button>
                        ) : (
                          <div className="cat-result-card__select">{body}</div>
                        )}
                        {enableCart ? (
                          <button
                            type="button"
                            className={`cat-icon-btn cat-result-card__add${justAdded ? " cat-result-card__add--added" : ""}`}
                            aria-label={
                              justAdded
                                ? messages.itemAdded
                                : canAdd
                                  ? messages.addToCart
                                  : messages.unableToAddToCart
                            }
                            disabled={!canAdd || isMutating}
                            onClick={() => onAddItem?.(product)}
                          >
                            {justAdded ? (
                              <Check size={16} strokeWidth={ICON_STROKE} />
                            ) : (
                              <ShoppingCart size={16} strokeWidth={ICON_STROKE} />
                            )}
                          </button>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        ))}
      </div>

      {enableCart ? (
        <div className="cat-mission__footer">
          <button
            type="button"
            className={`cat-checkout-cta cat-mission__add-all${justAddedAll ? " cat-mission__add-all--added" : ""}`}
            disabled={isMutating || bundleItems.length === 0}
            onClick={() => {
              void onAddAll(bundleItems).then((result) => {
                if (result) {
                  setJustAddedAll(true);
                  if (addedAllTimeoutRef.current !== null) {
                    window.clearTimeout(addedAllTimeoutRef.current);
                  }
                  addedAllTimeoutRef.current = window.setTimeout(() => {
                    setJustAddedAll(false);
                    addedAllTimeoutRef.current = null;
                  }, 1200);
                }
              });
            }}
          >
            {justAddedAll
              ? messages.missionItemsAdded
              : `${messages.missionAddAll} (${totalQuantity})`}
          </button>
        </div>
      ) : null}
    </div>
  );
}
