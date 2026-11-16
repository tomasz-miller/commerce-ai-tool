import {
  DEFAULT_COMMERCE_AI_SEARCH_MESSAGES,
  type CommerceAISearchMessages,
} from "../messages/index.js";
import { messageForError } from "./error-messages.js";

export type CameraFacingMode = "environment" | "user";

export function prefersNativeCamera(): boolean {
  if (typeof navigator === "undefined") return false;

  return (
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && matchMedia("(pointer: coarse)").matches)
  );
}

export function stopMediaStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

/** Localized text for a failed `getUserMedia()` call, from the `messages` contract. */
export function getCameraErrorMessage(
  error: unknown,
  messages: CommerceAISearchMessages = DEFAULT_COMMERCE_AI_SEARCH_MESSAGES,
): string {
  return messageForError(error, messages, { device: "camera", fallback: "cameraUnavailable" });
}

export function createJpegFileFromVideo(
  video: HTMLVideoElement,
  fileName = "camera-capture.jpg",
): Promise<File> {
  const width = video.videoWidth;
  const height = video.videoHeight;

  if (!width || !height) {
    return Promise.reject(new Error("Camera preview is not ready"));
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    return Promise.reject(new Error("Could not capture photo"));
  }

  context.drawImage(video, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Could not capture photo"));
          return;
        }

        resolve(new File([blob], fileName, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92,
    );
  });
}

export function buildCameraConstraints(facingMode: CameraFacingMode): MediaStreamConstraints {
  return {
    video: {
      facingMode: { ideal: facingMode },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
    audio: false,
  };
}
