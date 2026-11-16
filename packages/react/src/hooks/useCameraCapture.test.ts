import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCameraCapture } from "./useCameraCapture.js";
import * as cameraUtils from "@commerce-ai-tool/core/client";
import { DEFAULT_COMMERCE_AI_SEARCH_MESSAGES } from "@commerce-ai-tool/core/client";

vi.mock("@commerce-ai-tool/core/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@commerce-ai-tool/core/client")>();
  return { ...actual, prefersNativeCamera: vi.fn(), createJpegFileFromVideo: vi.fn() };
});

describe("useCameraCapture", () => {
  const getUserMedia = vi.fn();
  const stop = vi.fn();

  beforeEach(() => {
    getUserMedia.mockResolvedValue({
      getTracks: () => [{ stop }],
    });

    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("opens native capture on mobile devices", () => {
    vi.mocked(cameraUtils.prefersNativeCamera).mockReturnValue(true);
    const click = vi.fn();
    const nativeInputRef = {
      current: { click } as unknown as HTMLInputElement,
    };

    const { result } = renderHook(() => useCameraCapture());

    act(() => {
      result.current.open(nativeInputRef);
    });

    expect(click).toHaveBeenCalledTimes(1);
    expect(result.current.isOpen).toBe(false);
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("opens overlay on desktop devices", async () => {
    vi.mocked(cameraUtils.prefersNativeCamera).mockReturnValue(false);
    const nativeInputRef = { current: null };

    const { result } = renderHook(() => useCameraCapture());

    act(() => {
      result.current.open(nativeInputRef);
    });

    await waitFor(() => {
      expect(result.current.isOpen).toBe(true);
    });

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(result.current.stream).not.toBeNull();
  });

  it("maps permission errors when opening overlay", async () => {
    vi.mocked(cameraUtils.prefersNativeCamera).mockReturnValue(false);
    getUserMedia.mockRejectedValue(new DOMException("denied", "NotAllowedError"));

    const { result } = renderHook(() => useCameraCapture());

    await act(async () => {
      await result.current.openOverlay();
    });

    expect(result.current.error).toBe(DEFAULT_COMMERCE_AI_SEARCH_MESSAGES.cameraDenied);
    expect(result.current.isOpen).toBe(false);
  });

  it("captures a photo and closes the overlay", async () => {
    vi.mocked(cameraUtils.prefersNativeCamera).mockReturnValue(false);
    const file = new File(["jpeg"], "camera-capture.jpg", { type: "image/jpeg" });
    vi.mocked(cameraUtils.createJpegFileFromVideo).mockResolvedValue(file);

    const { result } = renderHook(() => useCameraCapture());

    await act(async () => {
      await result.current.openOverlay();
    });

    const video = {} as HTMLVideoElement;
    let captured: File | undefined;

    await act(async () => {
      captured = await result.current.capturePhoto(video);
    });

    expect(captured).toBe(file);
    expect(result.current.isOpen).toBe(false);
    expect(stop).toHaveBeenCalled();
  });

  it("stops tracks when closed", async () => {
    vi.mocked(cameraUtils.prefersNativeCamera).mockReturnValue(false);

    const { result } = renderHook(() => useCameraCapture());

    await act(async () => {
      await result.current.openOverlay();
    });

    act(() => {
      result.current.close();
    });

    expect(result.current.isOpen).toBe(false);
    expect(stop).toHaveBeenCalled();
  });
  function deferredStream() {
    let resolve!: (stream: unknown) => void;
    const promise = new Promise((res) => {
      resolve = res;
    });
    const trackStop = vi.fn();
    const mediaStream = { getTracks: () => [{ stop: trackStop }] };
    return { promise, resolve: () => resolve(mediaStream), trackStop };
  }

  it("stops a stream that arrives after the widget unmounted", async () => {
    vi.mocked(cameraUtils.prefersNativeCamera).mockReturnValue(false);
    const pending = deferredStream();
    getUserMedia.mockReturnValue(pending.promise);

    const { result, unmount } = renderHook(() => useCameraCapture());
    let opened!: Promise<void>;
    act(() => {
      opened = result.current.openOverlay();
    });

    unmount();
    pending.resolve();
    await opened;

    expect(pending.trackStop).toHaveBeenCalledTimes(1);
  });

  it("ignores a second open while the first permission prompt is pending", async () => {
    vi.mocked(cameraUtils.prefersNativeCamera).mockReturnValue(false);
    const pending = deferredStream();
    getUserMedia.mockReturnValue(pending.promise);

    const { result } = renderHook(() => useCameraCapture());
    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = result.current.openOverlay();
      second = result.current.openOverlay();
    });
    pending.resolve();
    await act(async () => {
      await Promise.all([first, second]);
    });

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(result.current.isOpen).toBe(true);
    expect(pending.trackStop).not.toHaveBeenCalled();

    act(() => {
      result.current.close();
    });
    expect(pending.trackStop).toHaveBeenCalledTimes(1);
  });

  it("stops a stream that arrives after close() and allows opening again", async () => {
    vi.mocked(cameraUtils.prefersNativeCamera).mockReturnValue(false);
    const pending = deferredStream();
    getUserMedia.mockReturnValueOnce(pending.promise);

    const { result } = renderHook(() => useCameraCapture());
    let first!: Promise<void>;
    act(() => {
      first = result.current.openOverlay();
    });
    act(() => {
      result.current.close();
    });
    pending.resolve();
    await act(async () => {
      await first;
    });

    expect(pending.trackStop).toHaveBeenCalledTimes(1);
    expect(result.current.isOpen).toBe(false);

    await act(async () => {
      await result.current.openOverlay();
    });
    expect(result.current.isOpen).toBe(true);
  });
});
