import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_COMMERCE_AI_SEARCH_MESSAGES as messages } from "../messages/index.js";
import {
  buildCameraConstraints,
  createJpegFileFromVideo,
  getCameraErrorMessage,
  prefersNativeCamera,
  stopMediaStream,
} from "./camera.js";

describe("prefersNativeCamera", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns true for iPhone user agent", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
      maxTouchPoints: 5,
    });
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));

    expect(prefersNativeCamera()).toBe(true);
  });

  it("returns true for coarse pointer touch devices", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0",
      maxTouchPoints: 5,
    });
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));

    expect(prefersNativeCamera()).toBe(true);
  });

  it("returns false for desktop browsers", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      maxTouchPoints: 0,
    });
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));

    expect(prefersNativeCamera()).toBe(false);
  });
});

describe("getCameraErrorMessage", () => {
  it("maps permission errors", () => {
    expect(getCameraErrorMessage(new DOMException("denied", "NotAllowedError"), messages)).toBe(
      messages.cameraDenied,
    );
  });

  it("maps missing device errors", () => {
    expect(getCameraErrorMessage(new DOMException("missing", "NotFoundError"), messages)).toBe(
      messages.cameraNotFound,
    );
  });

  it("maps an unreadable device to the in-use message", () => {
    expect(getCameraErrorMessage(new DOMException("busy", "NotReadableError"), messages)).toBe(
      messages.cameraInUse,
    );
  });

  it("falls back to the unavailable message", () => {
    expect(getCameraErrorMessage(new Error("boom"), messages)).toBe(messages.cameraUnavailable);
  });

  it("defaults to the English messages and honours localized overrides", () => {
    expect(getCameraErrorMessage(new DOMException("denied", "NotAllowedError"))).toBe(
      messages.cameraDenied,
    );
    expect(
      getCameraErrorMessage(new Error("boom"), { ...messages, cameraUnavailable: "Kamera niedostępna" }),
    ).toBe("Kamera niedostępna");
  });
});

describe("stopMediaStream", () => {
  it("stops all tracks", () => {
    const stop = vi.fn();
    const stream = {
      getTracks: () => [{ stop }, { stop }],
    } as unknown as MediaStream;

    stopMediaStream(stream);

    expect(stop).toHaveBeenCalledTimes(2);
  });
});

describe("buildCameraConstraints", () => {
  it("requests rear camera by default", () => {
    expect(buildCameraConstraints("environment")).toEqual({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });
  });
});

describe("createJpegFileFromVideo", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a JPEG file from the current video frame", async () => {
    const drawImage = vi.fn();
    const toBlob = vi.fn((callback: BlobCallback) => {
      callback(new Blob(["jpeg"], { type: "image/jpeg" }));
    });
    vi.stubGlobal("document", {
      createElement: (tagName: string) => {
        expect(tagName).toBe("canvas");
        return { width: 0, height: 0, getContext: () => ({ drawImage }), toBlob };
      },
    });

    const video = {
      videoWidth: 640,
      videoHeight: 480,
    } as HTMLVideoElement;

    const file = await createJpegFileFromVideo(video);

    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 640, 480);
    expect(file.name).toBe("camera-capture.jpg");
    expect(file.type).toBe("image/jpeg");
  });

  it("rejects when video dimensions are missing", async () => {
    const video = {
      videoWidth: 0,
      videoHeight: 0,
    } as HTMLVideoElement;

    await expect(createJpegFileFromVideo(video)).rejects.toThrow(
      "Camera preview is not ready",
    );
  });

  it("rejects when the canvas cannot encode a blob", async () => {
    vi.stubGlobal("document", {
      createElement: () => ({
        getContext: () => ({ drawImage: vi.fn() }),
        toBlob: (callback: BlobCallback) => callback(null),
      }),
    });

    await expect(
      createJpegFileFromVideo({ videoWidth: 4, videoHeight: 4 } as HTMLVideoElement),
    ).rejects.toThrow("Could not capture photo");
  });
});
