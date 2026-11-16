import {
  resolveCommerceAISearchMessages,
  type CommerceAISearchMessages,
} from "../messages/index.js";
import { CommerceAIApiError } from "./api-client.js";

export interface MessageForErrorOptions {
  /** Which media device a `DOMException` came from. Defaults to the microphone. */
  device?: "microphone" | "camera";
  /**
   * Message key for errors the caller can name better than this function: it is used for
   * anything unmapped and wins over the generic cart/checkout/session mappings
   * (`CART_NOT_FOUND`, `CART_ACCESS_DENIED`, `MISSING_PRICE`, `CHECKOUT_INCOMPLETE`,
   * `PAYMENT_NOT_CONFIGURED`, `SESSION_INVALID`), so an add-to-cart caller passing
   * `fallback: "unableToAddToCart"` does not show "Checkout failed". Specific codes
   * (`RATE_LIMITED`, `INVALID_CREDENTIALS`, `PAYMENT_DECLINED`, `ORDER_NOT_FOUND`) always map to
   * their own message. Defaults to `searchFailed`.
   */
  fallback?: keyof CommerceAISearchMessages;
}

const PERMISSION_DENIED = new Set(["NotAllowedError", "PermissionDeniedError"]);
const DEVICE_NOT_FOUND = new Set(["NotFoundError", "DevicesNotFoundError"]);
const DEVICE_IN_USE = new Set(["NotReadableError", "TrackStartError"]);

/**
 * `instanceof` fails when two copies of the package are loaded (ESM and CJS builds, or two
 * bundles), so an error is also recognised by its name and a string `code`.
 */
function asApiError(error: unknown): Pick<CommerceAIApiError, "code"> | null {
  if (error instanceof CommerceAIApiError) {
    return error;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "CommerceAIApiError" &&
    typeof (error as { code?: unknown }).code === "string"
  ) {
    return error as Pick<CommerceAIApiError, "code">;
  }
  return null;
}

/**
 * User-facing text for a failed request or media access, always taken from `messages` so a
 * localized widget never shows English, raw server text or browser exception text. Maps the stable
 * `ApiErrorCode` of a {@link CommerceAIApiError} and the `DOMException.name` values documented
 * for `getUserMedia()`; everything else yields the fallback message.
 */
export function messageForError(
  error: unknown,
  messageOverrides: CommerceAISearchMessages,
  options: MessageForErrorOptions = {},
): string {
  // Keys the host left out (added after 2.5.0) read as their English defaults.
  const messages = resolveCommerceAISearchMessages(messageOverrides);
  const fallback = messages[options.fallback ?? "searchFailed"];
  /** A generic mapping, unless the caller named a better message. */
  const generic = (key: keyof CommerceAISearchMessages): string =>
    options.fallback ? fallback : messages[key];

  const apiError = asApiError(error);
  if (apiError) {
    switch (apiError.code) {
      case "RATE_LIMITED":
        return messages.rateLimited;
      case "INVALID_CREDENTIALS":
        return messages.invalidCredentials;
      case "PAYMENT_DECLINED":
        return messages.paymentDeclined;
      case "ORDER_NOT_FOUND":
        return messages.orderNotFound;
      case "SESSION_INVALID":
        return generic("signInFailed");
      case "CHECKOUT_INCOMPLETE":
      case "MISSING_PRICE":
      case "PAYMENT_NOT_CONFIGURED":
      case "CART_NOT_FOUND":
      case "CART_ACCESS_DENIED":
        return generic("checkoutFailed");
      default:
        return fallback;
    }
  }

  if (error instanceof DOMException) {
    const camera = options.device === "camera";
    if (PERMISSION_DENIED.has(error.name)) {
      return camera ? messages.cameraDenied : messages.microphoneDenied;
    }
    if (DEVICE_NOT_FOUND.has(error.name)) {
      return camera ? messages.cameraNotFound : messages.microphoneUnavailable;
    }
    if (DEVICE_IN_USE.has(error.name)) {
      return camera ? messages.cameraInUse : messages.microphoneUnavailable;
    }
  }

  return fallback;
}
