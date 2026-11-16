import { formatNamedMessage, type ResolvedCommerceAISearchMessages } from "../messages/index.js";

/**
 * Accessible name of a product's add-to-cart button. A product that can be added is named
 * ("Add Running shoe to cart"), so a list of these buttons is not "Add to cart" repeated N times
 * (WCAG 2.4.6). Right after an add it says so, and a product without a sku or id says why it cannot.
 */
export function addToCartLabel(
  messages: Pick<
    ResolvedCommerceAISearchMessages,
    "addToCart" | "addToCartNamed" | "itemAdded" | "unableToAddToCart"
  >,
  product: { id: string; sku?: string; name: string },
  justAdded: boolean,
): string {
  if (justAdded) {
    return messages.itemAdded;
  }
  if (!(product.sku || product.id)) {
    return messages.unableToAddToCart;
  }
  return product.name.trim() ? formatNamedMessage(messages.addToCartNamed, product.name) : messages.addToCart;
}

/** Accessible name of the remove button of a cart line. */
export function removeItemLabel(
  messages: Pick<ResolvedCommerceAISearchMessages, "removeItem" | "removeItemNamed">,
  name: string,
): string {
  return name.trim() ? formatNamedMessage(messages.removeItemNamed, name) : messages.removeItem;
}

/**
 * Accessible name of the group holding the quantity controls of one cart line, so the shared
 * "Decrease quantity" / "Increase quantity" buttons are announced with their product.
 */
export function quantityGroupLabel(
  messages: Pick<ResolvedCommerceAISearchMessages, "quantityFor">,
  name: string,
): string {
  return formatNamedMessage(messages.quantityFor, name);
}
