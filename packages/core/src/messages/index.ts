export interface CommerceAISearchMessages {
  placeholder: string;
  searchAriaLabel: string;
  productSearchAriaLabel: string;
  searchResultsAriaLabel: string;
  searching: string;
  noProductsFound: string;
  searchedFor: string;
  dropImageToSearch: string;
  voiceSearch: string;
  stopRecording: string;
  searchByCamera: string;
  searchByImage: string;
  replayVoiceSummary: string;
  listening: string;
  tapMicToStop: string;
  understandingQuery: string;
  preparingAudioSummary: string;
  cameraCapture: string;
  cameraPreview: string;
  capturePhoto: string;
  cancel: string;
  dismiss: string;
  searchFailed: string;
  imageSearchFailed: string;
  couldNotCapturePhoto: string;
  /** Microphone permission was refused. Say how to re-enable it. Optional: the English default applies when omitted. */
  microphoneDenied?: string;
  /** No microphone, or it is in use by another app. Optional: the English default applies when omitted. */
  microphoneUnavailable?: string;
  /** Camera permission was refused. Say how to re-enable it. Optional: the English default applies when omitted. */
  cameraDenied?: string;
  /** Optional: the English default applies when omitted. */
  cameraNotFound?: string;
  /** Optional: the English default applies when omitted. */
  cameraInUse?: string;
  /** Optional: the English default applies when omitted. */
  cameraUnavailable?: string;
  /** The host API answered 429 (`RATE_LIMITED`). Optional: the English default applies when omitted. */
  rateLimited?: string;
  /** Result count announcement. Use `{count}` for the number of products. Optional: the English default applies when omitted. */
  resultsCount?: string;
  suggestionsAriaLabel: string;
  loadingSuggestions: string;
  noSuggestions: string;
  filtersAriaLabel: string;
  clearFilters: string;
  narrowResults: string;
  newSearch: string;
  addToCart: string;
  /**
   * Accessible name of a product's add-to-cart button. Use `{name}` for the product name.
   * Optional: when omitted it is built from `addToCart` (`"<addToCart>: <name>"`), or the English
   * default when `addToCart` is not overridden either.
   */
  addToCartNamed?: string;
  cart: string;
  emptyCart: string;
  removeItem: string;
  /**
   * Accessible name of a cart line's remove button. Use `{name}` for the product name.
   * Optional: when omitted it is built from `removeItem` (`"<removeItem>: <name>"`), or the English
   * default when `removeItem` is not overridden either.
   */
  removeItemNamed?: string;
  total: string;
  each: string;
  cartAriaLabel: string;
  itemAdded: string;
  increaseQuantity: string;
  decreaseQuantity: string;
  /**
   * Accessible name of the quantity controls of one cart line. Use `{name}` for the product name.
   * Optional: the English default applies when omitted.
   */
  quantityFor?: string;
  closeCart: string;
  unableToAddToCart: string;
  /** The cart could not be loaded or refreshed. Optional: the English default applies when omitted. */
  cartLoadFailed?: string;
  missionTitle: string;
  missionQuantity: string;
  /** Adds the first (recommended) product from each filled lane. Use `{count}` for the number of picks. */
  missionAddAll: string;
  missionItemsAdded: string;
  missionSelectProduct: string;
  missionIntentEmpty: string;
  missionIntentFailed: string;
  signIn: string;
  signInToSyncCart: string;
  signOut: string;
  email: string;
  password: string;
  signedInAs: string;
  invalidCredentials: string;
  signInFailed: string;
  checkout: string;
  checkoutTitle: string;
  orderSummary: string;
  shippingAddress: string;
  billingAddress: string;
  billingSameAsShipping: string;
  continueToDelivery: string;
  shippingMethod: string;
  selectShippingMethod: string;
  noShippingMethods: string;
  completeAddressToContinue: string;
  selectDeliveryToContinue: string;
  selectPaymentToContinue: string;
  checkoutStepAddress: string;
  checkoutStepDelivery: string;
  checkoutStepPayment: string;
  paymentMethod: string;
  selectPaymentMethod: string;
  paymentAuthorized: string;
  paymentDeclined: string;
  continueToPayment: string;
  placeOrder: string;
  placingOrder: string;
  orderPlaced: string;
  viewOrderStatus: string;
  continueShopping: string;
  checkoutFailed: string;
  orderStatus: string;
  orderPlacedAt: string;
  paymentStateLabel: string;
  shipmentStateLabel: string;
  trackingNumber: string;
  carrier: string;
  noTrackingYet: string;
  orderNotFound: string;
  noOrdersYet: string;
  yourOrders: string;
  firstName: string;
  lastName: string;
  streetName: string;
  additionalAddress: string;
  postalCode: string;
  city: string;
  region: string;
  country: string;
}

/**
 * `CommerceAISearchMessages` with every key present: what the widgets read. Keys added after 2.5.0
 * are optional in `CommerceAISearchMessages`, so a host's full object written against 2.5.0 still
 * type-checks; `resolveCommerceAISearchMessages` fills them from the English defaults.
 */
export type ResolvedCommerceAISearchMessages = Required<CommerceAISearchMessages>;

export const DEFAULT_COMMERCE_AI_SEARCH_MESSAGES: ResolvedCommerceAISearchMessages = {
  placeholder: "What are you looking for?",
  searchAriaLabel: "Search query",
  productSearchAriaLabel: "Product search",
  searchResultsAriaLabel: "Search results",
  searching: "Searching...",
  noProductsFound: "No products found",
  searchedFor: "Searched for:",
  dropImageToSearch: "Drop image to search",
  voiceSearch: "Voice search",
  stopRecording: "Stop recording",
  searchByCamera: "Search by camera",
  searchByImage: "Search by image",
  replayVoiceSummary: "Replay voice result summary",
  listening: "Listening…",
  tapMicToStop: "Tap mic to stop",
  understandingQuery: "Understanding your query…",
  preparingAudioSummary: "Preparing audio summary…",
  cameraCapture: "Camera capture",
  cameraPreview: "Camera preview",
  capturePhoto: "Capture",
  cancel: "Cancel",
  dismiss: "Dismiss",
  searchFailed: "Search failed",
  imageSearchFailed: "Image search failed",
  couldNotCapturePhoto: "Could not capture photo",
  microphoneDenied: "Microphone access denied. Allow the microphone in your browser settings to search by voice.",
  microphoneUnavailable: "No microphone available. Check that one is connected and not in use by another app.",
  cameraDenied: "Camera access denied. Allow the camera in your browser settings to search by camera.",
  cameraNotFound: "No camera found",
  cameraInUse: "Camera is already in use",
  cameraUnavailable: "Camera unavailable",
  rateLimited: "Too many requests. Please wait a moment and try again.",
  resultsCount: "Results: {count}",
  suggestionsAriaLabel: "Search suggestions",
  loadingSuggestions: "Loading suggestions...",
  noSuggestions: "No suggestions",
  filtersAriaLabel: "Search filters",
  clearFilters: "Clear filters",
  narrowResults: "Narrow your results",
  newSearch: "New search",
  addToCart: "Add to cart",
  addToCartNamed: "Add {name} to cart",
  cart: "Cart",
  emptyCart: "Your cart is empty",
  removeItem: "Remove item",
  removeItemNamed: "Remove {name} from cart",
  total: "Total",
  each: "each",
  cartAriaLabel: "Shopping cart",
  itemAdded: "Added to cart",
  increaseQuantity: "Increase quantity",
  decreaseQuantity: "Decrease quantity",
  quantityFor: "Quantity of {name}",
  closeCart: "Close cart",
  unableToAddToCart: "This product cannot be added to the cart",
  cartLoadFailed: "Couldn't load your cart. Please try again.",
  missionTitle: "Shopping list",
  missionQuantity: "Looking for",
  missionAddAll: "Add {count} top picks to cart",
  missionItemsAdded: "Added to cart",
  missionSelectProduct: "Select this product",
  missionIntentEmpty: "No matching products",
  missionIntentFailed: "Couldn't search this item",
  signIn: "Sign in",
  signInToSyncCart: "Sign in to sync your cart",
  signOut: "Sign out",
  email: "Email",
  password: "Password",
  signedInAs: "Signed in as",
  invalidCredentials: "Invalid email or password",
  signInFailed: "Sign in failed",
  checkout: "Checkout",
  checkoutTitle: "Complete your order",
  orderSummary: "Order summary",
  shippingAddress: "Shipping address",
  billingAddress: "Billing address",
  billingSameAsShipping: "Billing address is the same as shipping",
  continueToDelivery: "Continue to delivery",
  shippingMethod: "Delivery method",
  selectShippingMethod: "Select a delivery method",
  noShippingMethods: "No delivery methods are available for this address",
  completeAddressToContinue: "Add a shipping address to continue",
  selectDeliveryToContinue: "Select a delivery method to continue",
  selectPaymentToContinue: "Select a payment method to continue",
  checkoutStepAddress: "Address",
  checkoutStepDelivery: "Delivery",
  checkoutStepPayment: "Payment",
  paymentMethod: "Payment method",
  selectPaymentMethod: "Select a payment method",
  paymentAuthorized: "Payment authorized",
  paymentDeclined: "Payment was declined",
  continueToPayment: "Continue to payment",
  placeOrder: "Place order",
  placingOrder: "Placing order…",
  orderPlaced: "Order placed",
  viewOrderStatus: "View order status",
  continueShopping: "Continue shopping",
  checkoutFailed: "Checkout failed",
  orderStatus: "Order status",
  orderPlacedAt: "Placed",
  paymentStateLabel: "Payment",
  shipmentStateLabel: "Shipment",
  trackingNumber: "Tracking number",
  carrier: "Carrier",
  noTrackingYet: "Tracking details will appear when the order ships",
  orderNotFound: "Order not found",
  noOrdersYet: "No orders yet",
  yourOrders: "Your orders",
  firstName: "First name",
  lastName: "Last name",
  streetName: "Street address",
  additionalAddress: "Apartment, suite, etc. (optional)",
  postalCode: "Postal code",
  city: "City",
  region: "State or region (optional)",
  country: "Country",
};

export function resolveCommerceAISearchMessages(
  overrides?: Partial<CommerceAISearchMessages>,
): ResolvedCommerceAISearchMessages {
  const resolved: ResolvedCommerceAISearchMessages = { ...DEFAULT_COMMERCE_AI_SEARCH_MESSAGES };
  // An entry set to `undefined` (`cond ? text : undefined`) or `null` (JSON config, JS callers)
  // means "not overridden", not "no text".
  for (const [key, value] of Object.entries(overrides ?? {})) {
    if (value != null) {
      (resolved as Record<string, string>)[key] = value;
    }
  }
  // A host that translated `addToCart` / `removeItem` but predates the `{name}` keys keeps its own
  // wording ("Dodaj do koszyka: Buty") instead of getting the English default.
  if (overrides?.addToCart != null && overrides.addToCartNamed == null) {
    resolved.addToCartNamed = `${overrides.addToCart}: {name}`;
  }
  if (overrides?.removeItem != null && overrides.removeItemNamed == null) {
    resolved.removeItemNamed = `${overrides.removeItem}: {name}`;
  }
  return resolved;
}

/**
 * Fills the `{name}` placeholder of a message template with a product name. A template without the
 * placeholder gets the name appended, and an empty name leaves the template as it is.
 */
export function formatNamedMessage(template: string, name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return template.replaceAll("{name}", "").replace(/\s+/g, " ").trim();
  }
  return template.includes("{name}")
    ? template.replaceAll("{name}", trimmed)
    : `${template}: ${trimmed}`;
}
