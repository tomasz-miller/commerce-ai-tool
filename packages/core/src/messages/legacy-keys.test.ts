import { describe, expect, expectTypeOf, it } from "vitest";
import {
  DEFAULT_COMMERCE_AI_SEARCH_MESSAGES,
  resolveCommerceAISearchMessages,
  type CommerceAISearchMessages,
  type ResolvedCommerceAISearchMessages,
} from "./index.js";
import { CommerceAIApiError } from "../browser/api-client.js";
import { messageForError } from "../browser/error-messages.js";

/**
 * Every key of `CommerceAISearchMessages` as published in 2.5.0
 * (`git show @commerce-ai-tool/core@2.5.0:packages/core/src/messages/index.ts`). Keys added later
 * must stay optional, so a host's full object written against 2.5.0 keeps type-checking in 2.x.
 */
const MESSAGE_KEYS_2_5_0 = [
  "placeholder",
  "searchAriaLabel",
  "productSearchAriaLabel",
  "searchResultsAriaLabel",
  "searching",
  "noProductsFound",
  "searchedFor",
  "dropImageToSearch",
  "voiceSearch",
  "stopRecording",
  "searchByCamera",
  "searchByImage",
  "replayVoiceSummary",
  "listening",
  "tapMicToStop",
  "understandingQuery",
  "preparingAudioSummary",
  "cameraCapture",
  "cameraPreview",
  "capturePhoto",
  "cancel",
  "dismiss",
  "searchFailed",
  "imageSearchFailed",
  "couldNotCapturePhoto",
  "suggestionsAriaLabel",
  "loadingSuggestions",
  "noSuggestions",
  "filtersAriaLabel",
  "clearFilters",
  "narrowResults",
  "newSearch",
  "addToCart",
  "cart",
  "emptyCart",
  "removeItem",
  "total",
  "each",
  "cartAriaLabel",
  "itemAdded",
  "increaseQuantity",
  "decreaseQuantity",
  "closeCart",
  "unableToAddToCart",
  "missionTitle",
  "missionQuantity",
  "missionAddAll",
  "missionItemsAdded",
  "missionSelectProduct",
  "missionIntentEmpty",
  "missionIntentFailed",
  "signIn",
  "signInToSyncCart",
  "signOut",
  "email",
  "password",
  "signedInAs",
  "invalidCredentials",
  "signInFailed",
  "checkout",
  "checkoutTitle",
  "orderSummary",
  "shippingAddress",
  "billingAddress",
  "billingSameAsShipping",
  "continueToDelivery",
  "shippingMethod",
  "selectShippingMethod",
  "noShippingMethods",
  "completeAddressToContinue",
  "selectDeliveryToContinue",
  "selectPaymentToContinue",
  "checkoutStepAddress",
  "checkoutStepDelivery",
  "checkoutStepPayment",
  "paymentMethod",
  "selectPaymentMethod",
  "paymentAuthorized",
  "paymentDeclined",
  "continueToPayment",
  "placeOrder",
  "placingOrder",
  "orderPlaced",
  "viewOrderStatus",
  "continueShopping",
  "checkoutFailed",
  "orderStatus",
  "orderPlacedAt",
  "paymentStateLabel",
  "shipmentStateLabel",
  "trackingNumber",
  "carrier",
  "noTrackingYet",
  "orderNotFound",
  "noOrdersYet",
  "yourOrders",
  "firstName",
  "lastName",
  "streetName",
  "additionalAddress",
  "postalCode",
  "city",
  "region",
  "country",
] as const;

type LegacyKey = (typeof MESSAGE_KEYS_2_5_0)[number];

const ADDED_AFTER_2_5_0 = [
  "addToCartNamed",
  "cameraDenied",
  "cameraInUse",
  "cameraNotFound",
  "cameraUnavailable",
  "cartLoadFailed",
  "microphoneDenied",
  "microphoneUnavailable",
  "quantityFor",
  "rateLimited",
  "removeItemNamed",
  "resultsCount",
] as const;

/** A host's complete translation written against 2.5.0: only the keys that existed then. */
const legacyHostMessages = Object.fromEntries(
  MESSAGE_KEYS_2_5_0.map((key) => [key, `host:${key}`]),
) as Record<LegacyKey, string>;

describe("message keys added after 2.5.0", () => {
  it("accepts a 2.5.0-shaped object as CommerceAISearchMessages", () => {
    const host: CommerceAISearchMessages = legacyHostMessages;
    expectTypeOf(legacyHostMessages).toExtend<CommerceAISearchMessages>();
    expect(Object.keys(host)).toHaveLength(MESSAGE_KEYS_2_5_0.length);
  });

  it("keeps the new keys optional and the resolved type complete", () => {
    expectTypeOf<Pick<CommerceAISearchMessages, (typeof ADDED_AFTER_2_5_0)[number]>>().toEqualTypeOf<{
      addToCartNamed?: string;
      cameraDenied?: string;
      cameraInUse?: string;
      cameraNotFound?: string;
      cameraUnavailable?: string;
      cartLoadFailed?: string;
      microphoneDenied?: string;
      microphoneUnavailable?: string;
      quantityFor?: string;
      rateLimited?: string;
      removeItemNamed?: string;
      resultsCount?: string;
    }>();
    expectTypeOf<ResolvedCommerceAISearchMessages["rateLimited"]>().toEqualTypeOf<string>();
    expectTypeOf(DEFAULT_COMMERCE_AI_SEARCH_MESSAGES).toEqualTypeOf<ResolvedCommerceAISearchMessages>();
    expectTypeOf(resolveCommerceAISearchMessages(legacyHostMessages)).toEqualTypeOf<ResolvedCommerceAISearchMessages>();
  });

  it("fills omitted keys from the English defaults when resolving", () => {
    const resolved = resolveCommerceAISearchMessages(legacyHostMessages);

    for (const key of ADDED_AFTER_2_5_0.filter(
      (name) => name !== "addToCartNamed" && name !== "removeItemNamed",
    )) {
      expect(resolved[key], key).toBe(DEFAULT_COMMERCE_AI_SEARCH_MESSAGES[key]);
    }
    expect(resolved.searching).toBe("host:searching");
  });

  it("builds the {name} labels from a host's own addToCart and removeItem wording", () => {
    const resolved = resolveCommerceAISearchMessages(legacyHostMessages);

    expect(resolved.addToCartNamed).toBe("host:addToCart: {name}");
    expect(resolved.removeItemNamed).toBe("host:removeItem: {name}");
    expect(resolved.quantityFor).toBe(DEFAULT_COMMERCE_AI_SEARCH_MESSAGES.quantityFor);
    expect(
      resolveCommerceAISearchMessages({ ...legacyHostMessages, addToCartNamed: "host:named {name}" })
        .addToCartNamed,
    ).toBe("host:named {name}");
    expect(resolveCommerceAISearchMessages().addToCartNamed).toBe(
      DEFAULT_COMMERCE_AI_SEARCH_MESSAGES.addToCartNamed,
    );
  });

  it("makes messageForError read English defaults for omitted keys, host text for the rest", () => {
    const rateLimited = new CommerceAIApiError({ status: 429, code: "RATE_LIMITED", message: "raw" });
    const denied = new DOMException("denied", "NotAllowedError");

    expect(messageForError(rateLimited, legacyHostMessages)).toBe(
      DEFAULT_COMMERCE_AI_SEARCH_MESSAGES.rateLimited,
    );
    expect(messageForError(denied, legacyHostMessages)).toBe(
      DEFAULT_COMMERCE_AI_SEARCH_MESSAGES.microphoneDenied,
    );
    expect(messageForError(denied, legacyHostMessages, { device: "camera" })).toBe(
      DEFAULT_COMMERCE_AI_SEARCH_MESSAGES.cameraDenied,
    );
    expect(messageForError(new Error("x"), legacyHostMessages)).toBe("host:searchFailed");
  });
});
