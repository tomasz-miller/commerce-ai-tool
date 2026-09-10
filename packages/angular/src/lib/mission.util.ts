import type { AddToCartLineItem, MissionSearchResult, ProductCard } from "@commerce-ai-tool/core/client";

export function formatMissionAddAll(template: string, count: number): string {
  const withPlural = count === 1 ? template.replaceAll("top picks", "top pick") : template;
  if (withPlural.includes("{count}")) {
    return withPlural.replaceAll("{count}", String(count));
  }
  return `${withPlural} (${count})`;
}

export function toCartItem(product: ProductCard, quantity: number): AddToCartLineItem {
  return product.sku
    ? { sku: product.sku, quantity }
    : { productId: product.id, variantId: product.variantId, quantity };
}

export function lineItemKey(item: AddToCartLineItem): string {
  if (item.sku) {
    return `sku:${item.sku}`;
  }
  return `id:${item.productId ?? ""}:${item.variantId ?? ""}`;
}

export function starterBundleItems(mission: MissionSearchResult): AddToCartLineItem[] {
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
