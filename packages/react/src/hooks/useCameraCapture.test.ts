import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCameraCapture } from "./useCameraCapture.js";
import * as cameraUtils from "../utils/camera.js";

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
    vi.spyOn(cameraUtils, "prefersNativeCamera").mockReturnValue(true);
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
    vi.spyOn(cameraUtils, "prefersNativeCamera").mockReturnValue(false);
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
    vi.spyOn(cameraUtils, "prefersNativeCamera").mockReturnValue(false);
    getUserMedia.mockRejectedValue(new DOMException("denied", "NotAllowedError"));

    const { result } = renderHook(() => useCameraCapture());

    await act(async () => {
      await result.current.openOverlay();
    });

    expect(result.current.error).toBe("Camera access denied");
    expect(result.current.isOpen).toBe(false);
  });

  it("captures a photo and closes the overlay", async () => {
    vi.spyOn(cameraUtils, "prefersNativeCamera").mockReturnValue(false);
    const file = new File(["jpeg"], "camera-capture.jpg", { type: "image/jpeg" });
    vi.spyOn(cameraUtils, "createJpegFileFromVideo").mockResolvedValue(file);

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
    vi.spyOn(cameraUtils, "prefersNativeCamera").mockReturnValue(false);

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
});
