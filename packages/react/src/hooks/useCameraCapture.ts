import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  buildCameraConstraints,
  createJpegFileFromVideo,
  messageForError,
  prefersNativeCamera,
  stopMediaStream,
  type CameraFacingMode,
  type CommerceAISearchMessages,
} from "@commerce-ai-tool/core/client";
import { useMessagesRef } from "./useLatestRef.js";

export interface UseCameraCaptureOptions {
  facingMode?: CameraFacingMode;
  /** Host message overrides. `error` is always taken from these, never from the browser's text. */
  messages?: Partial<CommerceAISearchMessages>;
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
  // `requestIdRef` identifies the latest getUserMedia call; close() and unmount bump it so a stream
  // that arrives later is stopped instead of kept. `pendingRef` ignores a second open while the
  // permission prompt is still showing.
  const requestIdRef = useRef(0);
  const pendingRef = useRef(false);
  const mountedRef = useRef(false);
  const messagesRef = useMessagesRef(options.messages);

  const close = useCallback(() => {
    requestIdRef.current += 1;
    pendingRef.current = false;
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    setStream(null);
    setIsOpen(false);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const openOverlay = useCallback(async () => {
    if (pendingRef.current) {
      return;
    }
    setError(null);
    const requestId = ++requestIdRef.current;
    pendingRef.current = true;

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia(
        buildCameraConstraints(facingMode),
      );
      if (!mountedRef.current || requestId !== requestIdRef.current) {
        // Unmounted or closed while the permission prompt was open: do not open the overlay and
        // do not keep the camera on.
        stopMediaStream(mediaStream);
        return;
      }
      stopMediaStream(streamRef.current);
      streamRef.current = mediaStream;
      setStream(mediaStream);
      setIsOpen(true);
    } catch (err) {
      if (!mountedRef.current || requestId !== requestIdRef.current) {
        return;
      }
      setError(
        messageForError(err, messagesRef.current, {
          device: "camera",
          fallback: "cameraUnavailable",
        }),
      );
      close();
    } finally {
      if (requestId === requestIdRef.current) {
        pendingRef.current = false;
      }
    }
  }, [close, facingMode, messagesRef]);

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
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
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
