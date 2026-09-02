import { useEffect, useMemo, useState } from "react";
import { Check, Package, SearchX } from "lucide-react";
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
  onProductSelect?: (product: ProductCard) => void;
  onAddAll: (items: AddToCartLineItem[]) => Promise<unknown>;
}

function defaultSelection(mission: MissionSearchResult): Record<string, string> {
  const selected: Record<string, string> = {};
  for (const group of mission.intents) {
    const first = group.products[0];
    if (first) {
      selected[group.intent.id] = first.id;
    }
  }
  return selected;
}

function toCartItem(product: ProductCard, quantity: number): AddToCartLineItem {
  return product.sku
    ? { sku: product.sku, quantity }
    : { productId: product.id, variantId: product.variantId, quantity };
}

export function MissionResults({
  mission,
  messages,
  enableCart,
  isMutating,
  onProductSelect,
  onAddAll,
}: MissionResultsProps) {
  const [selectedIds, setSelectedIds] = useState<Record<string, string>>(() =>
    defaultSelection(mission),
  );
  const [justAdded, setJustAdded] = useState(false);

  useEffect(() => {
    setSelectedIds(defaultSelection(mission));
    setJustAdded(false);
  }, [mission]);

  const selectedItems = useMemo(() => {
    const items: AddToCartLineItem[] = [];
    for (const group of mission.intents) {
      const productId = selectedIds[group.intent.id];
      const product = group.products.find((item) => item.id === productId);
      if (!product || (!product.sku && !product.id)) {
        continue;
      }
      items.push(toCartItem(product, group.intent.quantity));
    }
    return items;
  }, [mission.intents, selectedIds]);

  const totalQuantity = selectedItems.reduce((sum, item) => sum + (item.quantity ?? 1), 0);

  return (
    <div className="cat-mission" role="list" aria-label={messages.missionTitle}>
      <div className="cat-mission__header">
        <h2 className="cat-mission__title">{messages.missionTitle}</h2>
        {mission.interpretation ? (
          <p className="cat-mission__interpretation">{mission.interpretation}</p>
        ) : null}
      </div>

      {mission.intents.map((group) => {
        const selectedId = selectedIds[group.intent.id];
        return (
          <section key={group.intent.id} className="cat-mission-group" role="listitem">
            <div className="cat-mission-group__header">
              <h3 className="cat-mission-group__label">{group.intent.label}</h3>
              <span className="cat-mission-group__qty">
                {messages.missionQuantity} {group.intent.quantity}
              </span>
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
              <div className="cat-results cat-mission-group__products">
                {group.products.map((product) => {
                  const selected = product.id === selectedId;
                  const canSelect = Boolean(product.sku || product.id);
                  return (
                    <article
                      key={product.id}
                      className={`cat-result-card${selected ? " cat-result-card--selected" : ""}`}
                    >
                      <div className="cat-result-card__core">
                        <button
                          type="button"
                          className="cat-result-card__select"
                          aria-pressed={selected}
                          aria-label={
                            selected ? product.name : `${messages.missionSelectProduct}: ${product.name}`
                          }
                          disabled={!canSelect}
                          onClick={() => {
                            if (selected) {
                              onProductSelect?.(product);
                              return;
                            }
                            setSelectedIds((current) => ({
                              ...current,
                              [group.intent.id]: product.id,
                            }));
                          }}
                        >
                          {product.imageUrl ? (
                            <img
                              src={product.imageUrl}
                              alt=""
                              className="cat-result-image"
                              loading="lazy"
                            />
                          ) : (
                            <div className="cat-result-image cat-result-image--placeholder">
                              <Package
                                size={20}
                                strokeWidth={ICON_STROKE}
                                color="var(--cat-text-muted)"
                              />
                            </div>
                          )}
                          <div className="cat-result-info">
                            <div className="cat-result-name">{product.name}</div>
                            {product.price ? (
                              <div className="cat-result-price">{product.price.formatted}</div>
                            ) : null}
                          </div>
                        </button>
                        {selected ? (
                          <span className="cat-mission-group__check" aria-hidden="true">
                            <Check size={14} strokeWidth={ICON_STROKE} />
                          </span>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}

      {enableCart ? (
        <div className="cat-mission__footer">
          <button
            type="button"
            className={`cat-checkout-cta cat-mission__add-all${justAdded ? " cat-mission__add-all--added" : ""}`}
            disabled={isMutating || selectedItems.length === 0}
            onClick={() => {
              void onAddAll(selectedItems).then((result) => {
                if (result) {
                  setJustAdded(true);
                  window.setTimeout(() => setJustAdded(false), 1200);
                }
              });
            }}
          >
            {justAdded ? messages.missionItemsAdded : `${messages.missionAddAll} (${totalQuantity})`}
          </button>
        </div>
      ) : null}
    </div>
  );
}
