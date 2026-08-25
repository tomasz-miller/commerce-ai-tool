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
  suggestionsAriaLabel: string;
  loadingSuggestions: string;
  noSuggestions: string;
  filtersAriaLabel: string;
  clearFilters: string;
  narrowResults: string;
  newSearch: string;
  addToCart: string;
  cart: string;
  emptyCart: string;
  removeItem: string;
  total: string;
  each: string;
  cartAriaLabel: string;
  itemAdded: string;
  increaseQuantity: string;
  decreaseQuantity: string;
  closeCart: string;
  unableToAddToCart: string;
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
  placeOrder: string;
  placingOrder: string;
  orderPlaced: string;
  continueShopping: string;
  checkoutFailed: string;
  firstName: string;
  lastName: string;
  streetName: string;
  additionalAddress: string;
  postalCode: string;
  city: string;
  region: string;
  country: string;
}

export const DEFAULT_COMMERCE_AI_SEARCH_MESSAGES: CommerceAISearchMessages = {
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
  suggestionsAriaLabel: "Search suggestions",
  loadingSuggestions: "Loading suggestions...",
  noSuggestions: "No suggestions",
  filtersAriaLabel: "Search filters",
  clearFilters: "Clear filters",
  narrowResults: "Narrow your results",
  newSearch: "New search",
  addToCart: "Add to cart",
  cart: "Cart",
  emptyCart: "Your cart is empty",
  removeItem: "Remove item",
  total: "Total",
  each: "each",
  cartAriaLabel: "Shopping cart",
  itemAdded: "Added to cart",
  increaseQuantity: "Increase quantity",
  decreaseQuantity: "Decrease quantity",
  closeCart: "Close cart",
  unableToAddToCart: "This product cannot be added to the cart",
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
  placeOrder: "Place order",
  placingOrder: "Placing order…",
  orderPlaced: "Order placed",
  continueShopping: "Continue shopping",
  checkoutFailed: "Checkout failed",
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
): CommerceAISearchMessages {
  return {
    ...DEFAULT_COMMERCE_AI_SEARCH_MESSAGES,
    ...overrides,
  };
}
