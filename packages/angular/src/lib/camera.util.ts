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

export function getCameraErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
      return "Camera access denied";
    }
    if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
      return "No camera found";
    }
    if (error.name === "NotReadableError" || error.name === "TrackStartError") {
      return "Camera is already in use";
    }
  }

  return "Camera unavailable";
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
