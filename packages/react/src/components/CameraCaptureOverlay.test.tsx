import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CameraCaptureOverlay } from "./CameraCaptureOverlay.js";

describe("CameraCaptureOverlay", () => {
  it("renders preview and action buttons", () => {
    const stream = {
      getTracks: () => [],
    } as unknown as MediaStream;

    render(
      <CameraCaptureOverlay
        stream={stream}
        error={null}
        onCapture={vi.fn()}
        onClose={vi.fn()}
        onDismissError={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Camera capture" })).toBeTruthy();
    expect(screen.getByLabelText("Camera preview")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Capture photo" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close camera" })).toBeTruthy();
  });

  it("calls onCapture with the video element", () => {
    const onCapture = vi.fn();

    render(
      <CameraCaptureOverlay
        stream={null}
        error={null}
        onCapture={onCapture}
        onClose={vi.fn()}
        onDismissError={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Capture photo" }));

    expect(onCapture).toHaveBeenCalledTimes(1);
    expect(onCapture.mock.calls[0]?.[0]).toBeInstanceOf(HTMLVideoElement);
  });

  it("shows permission errors with dismiss action", () => {
    const onDismissError = vi.fn();

    render(
      <CameraCaptureOverlay
        stream={null}
        error="Camera access denied"
        onCapture={vi.fn()}
        onClose={vi.fn()}
        onDismissError={onDismissError}
      />,
    );

    expect(screen.getByRole("alert").textContent).toContain("Camera access denied");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismissError).toHaveBeenCalledTimes(1);
  });
});
