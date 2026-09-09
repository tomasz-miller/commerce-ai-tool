"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CommerceAISearch, type CommerceAISearchProps } from "@commerce-ai-tool/react";
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

export function DemoSearch() {
  const router = useRouter();
  const titleId = useId();
  const [selectedProduct, setSelectedProduct] = useState<SelectedProduct | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  function closePreview() {
    setSelectedProduct(null);
  }

  function openPreview(product: SelectedProduct) {
    const active = document.activeElement;
    openerRef.current = active instanceof HTMLElement ? active : null;
    setSelectedProduct(product);
  }

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
              <h2 id={titleId}>{selectedProduct.name}</h2>
              {selectedProduct.description ? <p>{selectedProduct.description}</p> : null}
              <div className="demo-product-sheet__meta">
                {selectedProduct.price ? (
                  <strong>{selectedProduct.price.formatted}</strong>
                ) : null}
                {selectedProduct.sku ? <span>SKU {selectedProduct.sku}</span> : null}
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                className="demo-product-sheet__close"
                onClick={closePreview}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
