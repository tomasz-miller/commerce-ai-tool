export const PREVIEW_MIN_QUANTITY = 1;
export const PREVIEW_MAX_QUANTITY = 99;

export function clampPreviewQuantity(quantity: number): number {
  return Math.min(PREVIEW_MAX_QUANTITY, Math.max(PREVIEW_MIN_QUANTITY, quantity));
}

export function formatSheetTotal(
  price: { amount: number; currency: string; formatted: string },
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
