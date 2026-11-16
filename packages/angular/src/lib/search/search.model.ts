import {
  addToCartLabel as coreAddToCartLabel,
  type CommerceAISearchMessages,
  type InterpretedSearchFilters,
  type ProductCard,
  type ResolvedCommerceAISearchMessages,
} from "@commerce-ai-tool/core/client";

export type SearchMode = "text" | "image" | "voice" | null;

export type SearchMetaView = {
  queryInterpretation?: string;
  searchTerms?: string[];
  appliedFilters?: InterpretedSearchFilters;
};

export type MessageKey = keyof CommerceAISearchMessages;

export function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

/** Accessible name of a product's add-to-cart button, from its state. */
export function addToCartLabel(
  messages: Pick<
    ResolvedCommerceAISearchMessages,
    "addToCart" | "addToCartNamed" | "itemAdded" | "unableToAddToCart"
  >,
  addedProductIds: Record<string, true>,
  product: Pick<ProductCard, "id" | "sku" | "name">,
): string {
  return coreAddToCartLabel(messages, product, Boolean(addedProductIds[product.id]));
}

/** DOM id of the suggestion at `index`: the listbox id of the widget instance plus the position. */
export function suggestionOptionId(listboxId: string, index: number): string {
  return `${listboxId}-option-${index}`;
}
