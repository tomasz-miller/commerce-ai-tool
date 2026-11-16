import { type KeyboardEvent, type RefObject, type SyntheticEvent, useEffect, useRef } from "react";
import { Camera, X } from "lucide-react";
import type { ResolvedCommerceAISearchMessages } from "@commerce-ai-tool/core/client";
import { focusFirstAvailable, getFocusable } from "@commerce-ai-tool/core/client";
import { useLatestRef } from "../hooks/useLatestRef.js";
import { ICON_STROKE } from "../icons.js";

export interface CameraCaptureOverlayProps {
  stream: MediaStream | null;
  error: string | null;
  messages: Pick<
    ResolvedCommerceAISearchMessages,
    "cameraCapture" | "cameraPreview" | "capturePhoto" | "cancel" | "dismiss"
  >;
  onCapture: (video: HTMLVideoElement) => void;
  onClose: () => void;
  onDismissError: () => void;
  /** Where focus goes on close; defaults to the element that was focused when the overlay opened. */
  returnFocusTo?: RefObject<HTMLElement | null>;
  /**
   * Used when the return target is disabled or gone, which is the normal case after a capture: the
   * image search starts and disables the camera button. Focus goes here (the search field).
   */
  fallbackFocusTo?: RefObject<HTMLElement | null>;
}

export function CameraCaptureOverlay({
  stream,
  error,
  messages,
  onCapture,
  onClose,
  onDismissError,
  returnFocusTo,
  fallbackFocusTo,
}: CameraCaptureOverlayProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const dismissRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useLatestRef(returnFocusTo);
  const fallbackFocusRef = useLatestRef(fallbackFocusTo);

  // A modal <dialog>: the browser makes the page behind inert, renders it in the top layer and
  // fires `cancel` on Escape. Focus goes back to the opener on unmount.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const opener = document.activeElement;
    if (!dialog.open) {
      if (typeof dialog.showModal === "function") {
        dialog.showModal();
      } else {
        dialog.setAttribute("open", "");
      }
    }
    return () => {
      if (typeof dialog.close === "function") {
        if (dialog.open) dialog.close();
      } else {
        dialog.removeAttribute("open");
      }
      // These refs hold the latest props on purpose: the targets are read when the overlay closes.
      // The opener may be disabled by now (a capture starts a search): fall back to the search field.
      /* eslint-disable react-hooks/exhaustive-deps */
      focusFirstAvailable(
        returnFocusRef.current?.current,
        opener,
        fallbackFocusRef.current?.current,
      );
      /* eslint-enable react-hooks/exhaustive-deps */
    };
  }, [returnFocusRef, fallbackFocusRef]);

  // Initial focus: the capture button, or the dismiss button while an error shows (APG: focus
  // moves to the most likely action inside the dialog).
  useEffect(() => {
    (error ? dismissRef.current : primaryRef.current)?.focus();
  }, [error]);

  function handleCancel(event: SyntheticEvent<HTMLDialogElement>) {
    // Closing is the parent's decision (it stops the stream); the element unmounts with the state.
    event.preventDefault();
    if (error) {
      onDismissError();
    } else {
      onClose();
    }
  }

  // APG: Tab wraps from the last control to the first, Shift+Tab the other way round.
  function handleKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== "Tab") return;
    const controls = getFocusable(event.currentTarget);
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === event.currentTarget)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.srcObject = stream;

    if (stream) {
      const playPromise = video.play();
      if (playPromise) {
        void playPromise.catch(() => {
          // Ignore autoplay interruptions in tests or restrictive browsers.
        });
      }
    }

    return () => {
      video.srcObject = null;
    };
  }, [stream]);

  return (
    <dialog
      ref={dialogRef}
      className="cat-camera-overlay"
      aria-modal="true"
      aria-label={messages.cameraCapture}
      onCancel={handleCancel}
      onKeyDown={handleKeyDown}
    >
      <div className="cat-camera-overlay__panel">
        {error ? (
          <div className="cat-camera-overlay__error" role="alert">
            <p>{error}</p>
            <button
              ref={dismissRef}
              type="button"
              className="cat-camera-overlay__btn"
              onClick={onDismissError}
            >
              {messages.dismiss}
            </button>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              className="cat-camera-preview"
              autoPlay
              playsInline
              muted
              aria-label={messages.cameraPreview}
            />

            <div className="cat-camera-actions">
              <button
                type="button"
                className="cat-camera-overlay__btn cat-camera-overlay__btn--secondary"
                onClick={onClose}
                aria-label={messages.cancel}
              >
                <X size={16} strokeWidth={ICON_STROKE} aria-hidden="true" />
                {messages.cancel}
              </button>
              <button
                ref={primaryRef}
                type="button"
                className="cat-camera-overlay__btn cat-camera-overlay__btn--primary"
                onClick={() => {
                  if (videoRef.current) onCapture(videoRef.current);
                }}
                aria-label={messages.capturePhoto}
              >
                <Camera size={16} strokeWidth={ICON_STROKE} aria-hidden="true" />
                {messages.capturePhoto}
              </button>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}
