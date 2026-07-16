import { useEffect, useRef } from "react";
import { Camera, X } from "lucide-react";
import type { CommerceAISearchMessages } from "@commerce-ai-tool/core";

export interface CameraCaptureOverlayProps {
  stream: MediaStream | null;
  error: string | null;
  messages: Pick<
    CommerceAISearchMessages,
    "cameraCapture" | "cameraPreview" | "capturePhoto" | "cancel" | "dismiss"
  >;
  onCapture: (video: HTMLVideoElement) => void;
  onClose: () => void;
  onDismissError: () => void;
}

export function CameraCaptureOverlay({
  stream,
  error,
  messages,
  onCapture,
  onClose,
  onDismissError,
}: CameraCaptureOverlayProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

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
    <div className="cat-camera-overlay" role="dialog" aria-label={messages.cameraCapture}>
      <div className="cat-camera-overlay__panel">
        {error ? (
          <div className="cat-camera-overlay__error" role="alert">
            <p>{error}</p>
            <button type="button" className="cat-camera-overlay__btn" onClick={onDismissError}>
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
                <X size={16} aria-hidden="true" />
                {messages.cancel}
              </button>
              <button
                type="button"
                className="cat-camera-overlay__btn cat-camera-overlay__btn--primary"
                onClick={() => {
                  if (videoRef.current) onCapture(videoRef.current);
                }}
                aria-label={messages.capturePhoto}
              >
                <Camera size={16} aria-hidden="true" />
                {messages.capturePhoto}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
