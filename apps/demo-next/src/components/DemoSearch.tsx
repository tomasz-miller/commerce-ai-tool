"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  CommerceAISearch,
  useCart,
  type CommerceAISearchProps,
} from "@commerce-ai-tool/react";
import { useRouter } from "next/navigation";
import {
  demoCatalogLocale,
  demoCountry,
  demoCurrency,
  demoQueryLocale,
} from "../lib/search-config";

type SelectedProduct = Parameters<NonNullable<CommerceAISearchProps["onProductSelect"]>>[0];

const SHEET_FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const DESCRIPTION_EXPAND_THRESHOLD = 200;
const MIN_SHEET_QUANTITY = 1;
const MAX_SHEET_QUANTITY = 99;

function formatSheetTotal(
  price: NonNullable<SelectedProduct["price"]>,
  quantity: number,
  locale: string | undefined,
): string {
  try {
    return new Intl.NumberFormat(locale || undefined, {
      style: "currency",
      currency: price.currency,
    }).format(price.amount * quantity);
  } catch {
    return price.formatted;
  }
}

export function DemoSearch() {
  const router = useRouter();
  const titleId = useId();
  const descriptionId = useId();
  const quantityId = useId();
  const [selectedProduct, setSelectedProduct] = useState<SelectedProduct | null>(null);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [justAdded, setJustAdded] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const sheetCart = useCart({
    apiBaseUrl: "/api/commerce-ai",
    currency: demoCurrency,
    country: demoCountry,
    catalogLocale: demoCatalogLocale,
  });

  function closePreview() {
    setDescriptionExpanded(false);
    setQuantity(1);
    setJustAdded(false);
    setAddError(null);
    setSelectedProduct(null);
  }

  function openPreview(product: SelectedProduct) {
    const active = document.activeElement;
    openerRef.current = active instanceof HTMLElement ? active : null;
    setDescriptionExpanded(false);
    setQuantity(1);
    setJustAdded(false);
    setAddError(null);
    setSelectedProduct(product);
    void sheetCart.refresh();
  }

  function changeQuantity(delta: number) {
    setJustAdded(false);
    setAddError(null);
    setQuantity((current) =>
      Math.min(MAX_SHEET_QUANTITY, Math.max(MIN_SHEET_QUANTITY, current + delta)),
    );
  }

  async function handleSheetAddToCart() {
    if (!selectedProduct || sheetCart.isMutating) {
      return;
    }
    setAddError(null);
    const result = selectedProduct.sku
      ? await sheetCart.addToCart({ sku: selectedProduct.sku, quantity })
      : await sheetCart.addToCart({
          productId: selectedProduct.id,
          variantId: selectedProduct.variantId,
          quantity,
        });
    if (result) {
      setJustAdded(true);
    } else {
      setAddError("Could not add this product to the cart.");
    }
  }

  useEffect(() => {
    if (!selectedProduct) {
      return;
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [selectedProduct]);

  useEffect(() => {
    if (!selectedProduct) {
      openerRef.current?.focus();
      return;
    }

    closeButtonRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closePreview();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const root = sheetRef.current;
      if (!root) {
        return;
      }

      const focusable = [...root.querySelectorAll<HTMLElement>(SHEET_FOCUSABLE)];
      if (focusable.length === 0) {
        event.preventDefault();
        root.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) {
        return;
      }

      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedProduct]);

  return (
    <>
      <div inert={selectedProduct ? true : undefined}>
        <CommerceAISearch
          apiBaseUrl="/api/commerce-ai"
          theme="dark"
          catalogLocale={demoCatalogLocale}
          queryLocale={demoQueryLocale}
          currency={demoCurrency}
          country={demoCountry}
          enableAutocomplete
          enableFacets
          enableVoice
          enableImageSearch
          enableTts
          enableCart
          enableMissions
          onCheckout={() => router.push("/checkout")}
          onProductSelect={openPreview}
        />
      </div>

      {selectedProduct ? (
        <div
          ref={sheetRef}
          className="demo-product-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          onClick={closePreview}
        >
          <div
            className="demo-product-sheet__bezel"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="demo-product-sheet__core">
              {selectedProduct.imageUrl ? (
                <img
                  src={selectedProduct.imageUrl}
                  alt=""
                  className="demo-product-sheet__image"
                />
              ) : (
                <div className="demo-product-sheet__image--placeholder" aria-hidden="true">
                  No image
                </div>
              )}
              <div className="demo-product-sheet__header">
                <h2 id={titleId}>{selectedProduct.name}</h2>
                {selectedProduct.price ? (
                  <strong className="demo-product-sheet__price">
                    {selectedProduct.price.formatted}
                  </strong>
                ) : null}
              </div>
              {selectedProduct.description ? (
                <div className="demo-product-sheet__scroll">
                  <p
                    id={descriptionId}
                    className={
                      selectedProduct.description.length > DESCRIPTION_EXPAND_THRESHOLD &&
                      !descriptionExpanded
                        ? "demo-product-sheet__description demo-product-sheet__description--clamped"
                        : "demo-product-sheet__description"
                    }
                  >
                    {selectedProduct.description}
                  </p>
                  {selectedProduct.description.length > DESCRIPTION_EXPAND_THRESHOLD ? (
                    <button
                      type="button"
                      className="demo-product-sheet__toggle"
                      aria-expanded={descriptionExpanded}
                      aria-controls={descriptionId}
                      onClick={() => setDescriptionExpanded((value) => !value)}
                    >
                      {descriptionExpanded ? "Show less" : "Show more"}
                    </button>
                  ) : null}
                </div>
              ) : null}
              <div className="demo-product-sheet__footer">
                {selectedProduct.sku ? (
                  <div className="demo-product-sheet__meta">
                    <span>SKU {selectedProduct.sku}</span>
                  </div>
                ) : null}
                <div className="demo-product-sheet__purchase">
                  <div
                    className="demo-product-sheet__qty"
                    role="group"
                    aria-labelledby={quantityId}
                  >
                    <span id={quantityId} className="demo-product-sheet__qty-label">
                      Quantity
                    </span>
                    <div className="demo-product-sheet__qty-controls">
                      <button
                        type="button"
                        className="demo-product-sheet__qty-btn"
                        aria-label="Decrease quantity"
                        disabled={quantity <= MIN_SHEET_QUANTITY || sheetCart.isMutating}
                        onClick={() => changeQuantity(-1)}
                      >
                        −
                      </button>
                      <span className="demo-product-sheet__qty-value" aria-live="polite">
                        {quantity}
                      </span>
                      <button
                        type="button"
                        className="demo-product-sheet__qty-btn"
                        aria-label="Increase quantity"
                        disabled={quantity >= MAX_SHEET_QUANTITY || sheetCart.isMutating}
                        onClick={() => changeQuantity(1)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="demo-product-sheet__add"
                    disabled={sheetCart.isMutating}
                    onClick={() => void handleSheetAddToCart()}
                  >
                    {sheetCart.isMutating
                      ? "Adding…"
                      : justAdded
                        ? "Added to cart"
                        : selectedProduct.price
                          ? `Add to cart · ${formatSheetTotal(selectedProduct.price, quantity, demoCatalogLocale)}`
                          : "Add to cart"}
                  </button>
                  <button
                    ref={closeButtonRef}
                    type="button"
                    className="demo-product-sheet__close"
                    onClick={closePreview}
                  >
                    Close
                  </button>
                </div>
                {justAdded ? (
                  <p className="demo-product-sheet__feedback" role="status">
                    Added {quantity} {quantity === 1 ? "item" : "items"} to your cart.
                  </p>
                ) : null}
                {addError && !justAdded ? (
                  <p className="demo-product-sheet__error" role="alert">
                    {addError}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
