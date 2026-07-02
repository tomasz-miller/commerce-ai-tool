import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  buildCameraConstraints,
  createJpegFileFromVideo,
  getCameraErrorMessage,
  prefersNativeCamera,
  stopMediaStream,
  type CameraFacingMode,
} from "../utils/camera.js";

export interface UseCameraCaptureOptions {
  facingMode?: CameraFacingMode;
}

export interface UseCameraCaptureReturn {
  isOpen: boolean;
  stream: MediaStream | null;
  error: string | null;
  facingMode: CameraFacingMode;
  open: (nativeInputRef: RefObject<HTMLInputElement | null>) => void;
  openOverlay: () => Promise<void>;
  capturePhoto: (video: HTMLVideoElement) => Promise<File>;
  close: () => void;
  clearError: () => void;
}

export function useCameraCapture(
  options: UseCameraCaptureOptions = {},
): UseCameraCaptureReturn {
  const facingMode = options.facingMode ?? "environment";
  const [isOpen, setIsOpen] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const close = useCallback(() => {
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    setStream(null);
    setIsOpen(false);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const openOverlay = useCallback(async () => {
    setError(null);

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia(
        buildCameraConstraints(facingMode),
      );
      streamRef.current = mediaStream;
      setStream(mediaStream);
      setIsOpen(true);
    } catch (err) {
      setError(getCameraErrorMessage(err));
      close();
    }
  }, [close, facingMode]);

  const open = useCallback(
    (nativeInputRef: RefObject<HTMLInputElement | null>) => {
      setError(null);

      if (prefersNativeCamera()) {
        nativeInputRef.current?.click();
        return;
      }

      void openOverlay();
    },
    [openOverlay],
  );

  const capturePhoto = useCallback(
    async (video: HTMLVideoElement) => {
      const file = await createJpegFileFromVideo(video);
      close();
      return file;
    },
    [close],
  );

  useEffect(() => {
    return () => {
      stopMediaStream(streamRef.current);
      streamRef.current = null;
    };
  }, []);

  return {
    isOpen,
    stream,
    error,
    facingMode,
    open,
    openOverlay,
    capturePhoto,
    close,
    clearError,
  };
}
