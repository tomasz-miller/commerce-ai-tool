import { describe, expect, it } from "vitest";
import { DEFAULT_COMMERCE_AI_SEARCH_MESSAGES as messages } from "../messages/index.js";
import type { ApiErrorCode } from "../types/index.js";
import { CommerceAIApiError } from "./api-client.js";
import { messageForError } from "./error-messages.js";

function apiError(code: ApiErrorCode, status = 400): CommerceAIApiError {
  return new CommerceAIApiError({ status, code, message: "raw server text" });
}

describe("messageForError", () => {
  it("maps RATE_LIMITED to the rateLimited message", () => {
    expect(messageForError(apiError("RATE_LIMITED", 429), messages)).toBe(messages.rateLimited);
  });

  it("maps INVALID_CREDENTIALS and PAYMENT_DECLINED to their messages", () => {
    expect(messageForError(apiError("INVALID_CREDENTIALS", 401), messages)).toBe(
      messages.invalidCredentials,
    );
    expect(messageForError(apiError("PAYMENT_DECLINED", 402), messages)).toBe(messages.paymentDeclined);
  });

  it("never exposes raw server text for other codes", () => {
    for (const code of ["INTERNAL", "UPSTREAM_UNAVAILABLE", "TIMEOUT", "VALIDATION"] as const) {
      expect(messageForError(apiError(code, 500), messages)).toBe(messages.searchFailed);
    }
  });

  it("uses the caller's fallback key for unmapped errors", () => {
    expect(messageForError(apiError("INTERNAL", 500), messages, { fallback: "imageSearchFailed" })).toBe(
      messages.imageSearchFailed,
    );
  });

  it("never exposes the text of a plain Error or an unknown value", () => {
    expect(messageForError(new SyntaxError("Unexpected token <"), messages)).toBe(messages.searchFailed);
    expect(messageForError("boom", messages)).toBe(messages.searchFailed);
    expect(messageForError(undefined, messages)).toBe(messages.searchFailed);
  });

  it("maps microphone permission errors by DOMException name", () => {
    expect(messageForError(new DOMException("x", "NotAllowedError"), messages)).toBe(
      messages.microphoneDenied,
    );
    expect(messageForError(new DOMException("x", "PermissionDeniedError"), messages)).toBe(
      messages.microphoneDenied,
    );
  });

  it("maps camera DOMException names", () => {
    const camera = { device: "camera", fallback: "cameraUnavailable" } as const;
    expect(messageForError(new DOMException("x", "NotAllowedError"), messages, camera)).toBe(
      messages.cameraDenied,
    );
    expect(messageForError(new DOMException("x", "NotFoundError"), messages, camera)).toBe(
      messages.cameraNotFound,
    );
    expect(messageForError(new DOMException("x", "DevicesNotFoundError"), messages, camera)).toBe(
      messages.cameraNotFound,
    );
    expect(messageForError(new DOMException("x", "NotReadableError"), messages, camera)).toBe(
      messages.cameraInUse,
    );
    expect(messageForError(new DOMException("x", "TrackStartError"), messages, camera)).toBe(
      messages.cameraInUse,
    );
    expect(messageForError(new Error("boom"), messages, camera)).toBe(messages.cameraUnavailable);
  });

  it("uses overridden (localized) messages", () => {
    const localized = { ...messages, rateLimited: "Za dużo żądań" };
    expect(messageForError(apiError("RATE_LIMITED", 429), localized)).toBe("Za dużo żądań");
  });

  it("recognises an API error from another copy of the package by name and code", () => {
    const foreign = Object.assign(new Error("raw"), { name: "CommerceAIApiError", code: "RATE_LIMITED" });
    expect(messageForError(foreign, messages)).toBe(messages.rateLimited);
    expect(messageForError({ name: "CommerceAIApiError", code: "RATE_LIMITED" }, messages)).toBe(
      messages.rateLimited,
    );
    // Without a string code it is not an API error.
    expect(messageForError({ name: "CommerceAIApiError" }, messages)).toBe(messages.searchFailed);
  });

  it("maps cart and session codes generically, but an explicit fallback wins", () => {
    for (const code of ["CART_NOT_FOUND", "CART_ACCESS_DENIED", "MISSING_PRICE"] as const) {
      expect(messageForError(apiError(code), messages)).toBe(messages.checkoutFailed);
      expect(messageForError(apiError(code), messages, { fallback: "unableToAddToCart" })).toBe(
        messages.unableToAddToCart,
      );
    }
    expect(messageForError(apiError("SESSION_INVALID", 401), messages)).toBe(messages.signInFailed);
    expect(messageForError(apiError("SESSION_INVALID", 401), messages, { fallback: "unableToAddToCart" })).toBe(
      messages.unableToAddToCart,
    );
  });

  it("keeps specific codes even when the caller passes a fallback", () => {
    expect(messageForError(apiError("RATE_LIMITED", 429), messages, { fallback: "unableToAddToCart" })).toBe(
      messages.rateLimited,
    );
    expect(messageForError(apiError("PAYMENT_DECLINED", 402), messages, { fallback: "checkoutFailed" })).toBe(
      messages.paymentDeclined,
    );
  });

  it("maps an unavailable or busy microphone", () => {
    for (const name of ["NotFoundError", "DevicesNotFoundError", "NotReadableError", "TrackStartError"]) {
      expect(messageForError(new DOMException("x", name), messages)).toBe(messages.microphoneUnavailable);
      expect(messageForError(new DOMException("x", name), messages, { device: "microphone" })).toBe(
        messages.microphoneUnavailable,
      );
    }
  });
});
