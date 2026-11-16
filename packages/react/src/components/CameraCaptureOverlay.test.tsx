import { DEFAULT_COMMERCE_AI_SEARCH_MESSAGES } from "@commerce-ai-tool/core/client";
import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CameraCaptureOverlay } from "./CameraCaptureOverlay.js";

const messages = DEFAULT_COMMERCE_AI_SEARCH_MESSAGES;

// jsdom has HTMLDialogElement but not showModal() / close().
const showModal = vi.fn(function (this: HTMLDialogElement) {
  this.setAttribute("open", "");
});
const close = vi.fn(function (this: HTMLDialogElement) {
  this.removeAttribute("open");
});

function cancelDialog(dialog: HTMLElement) {
  const event = createEvent("cancel", dialog, { cancelable: true });
  fireEvent(dialog, event);
  return event;
}

describe("CameraCaptureOverlay", () => {
  beforeEach(() => {
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: showModal });
    Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: close });
    showModal.mockClear();
    close.mockClear();
  });

  afterEach(() => {
    Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
    Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
    document.body.replaceChildren();
  });

  it("renders preview and action buttons", () => {
    const stream = {
      getTracks: () => [],
    } as unknown as MediaStream;

    render(
      <CameraCaptureOverlay
        stream={stream}
        error={null}
        messages={messages}
        onCapture={vi.fn()}
        onClose={vi.fn()}
        onDismissError={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Camera capture" });
    expect(dialog.tagName).toBe("DIALOG");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(showModal).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Camera preview")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Capture" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  });

  it("calls onCapture with the video element", () => {
    const onCapture = vi.fn();

    render(
      <CameraCaptureOverlay
        stream={null}
        error={null}
        messages={messages}
        onCapture={onCapture}
        onClose={vi.fn()}
        onDismissError={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Capture" }));

    expect(onCapture).toHaveBeenCalledTimes(1);
    expect(onCapture.mock.calls[0]?.[0]).toBeInstanceOf(HTMLVideoElement);
  });

  it("shows permission errors with dismiss action", () => {
    const onDismissError = vi.fn();

    render(
      <CameraCaptureOverlay
        stream={null}
        error="Camera access denied"
        messages={messages}
        onCapture={vi.fn()}
        onClose={vi.fn()}
        onDismissError={onDismissError}
      />,
    );

    expect(screen.getByRole("alert").textContent).toContain("Camera access denied");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismissError).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();

    render(
      <CameraCaptureOverlay
        stream={null}
        error={null}
        messages={messages}
        onCapture={vi.fn()}
        onClose={onClose}
        onDismissError={vi.fn()}
      />,
    );

    const event = cancelDialog(screen.getByRole("dialog", { name: "Camera capture" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    // The parent owns closing (it stops the stream), so the native close is prevented.
    expect(event.defaultPrevented).toBe(true);
  });

  it("dismisses a permission error on Escape without closing", () => {
    const onClose = vi.fn();
    const onDismissError = vi.fn();

    render(
      <CameraCaptureOverlay
        stream={null}
        error="Camera access denied"
        messages={messages}
        onCapture={vi.fn()}
        onClose={onClose}
        onDismissError={onDismissError}
      />,
    );

    cancelDialog(screen.getByRole("dialog", { name: "Camera capture" }));
    expect(onDismissError).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("camera overlay focuses the capture button on open and returns focus on close", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();

    const view = render(
      <CameraCaptureOverlay
        stream={null}
        error={null}
        messages={messages}
        onCapture={vi.fn()}
        onClose={vi.fn()}
        onDismissError={vi.fn()}
      />,
    );
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Capture" }));

    view.unmount();

    expect(close).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(opener);
  });

  it("returns focus to the explicit target when one is passed", () => {
    const opener = document.createElement("button");
    const target = document.createElement("button");
    document.body.append(opener, target);
    opener.focus();

    const view = render(
      <CameraCaptureOverlay
        stream={null}
        error={null}
        messages={messages}
        onCapture={vi.fn()}
        onClose={vi.fn()}
        onDismissError={vi.fn()}
        returnFocusTo={{ current: target }}
      />,
    );
    view.unmount();

    expect(document.activeElement).toBe(target);
  });

  it("falls back to the search field when the camera button is disabled after a capture", () => {
    const camera = document.createElement("button");
    const searchField = document.createElement("input");
    document.body.append(camera, searchField);
    camera.focus();

    const view = render(
      <CameraCaptureOverlay
        stream={null}
        error={null}
        messages={messages}
        onCapture={vi.fn()}
        onClose={vi.fn()}
        onDismissError={vi.fn()}
        returnFocusTo={{ current: camera }}
        fallbackFocusTo={{ current: searchField }}
      />,
    );
    // The capture starts an image search, which disables the camera button.
    camera.disabled = true;
    view.unmount();

    expect(document.activeElement).toBe(searchField);
  });

  it("skips disabled and hidden controls when wrapping Tab", () => {
    render(
      <CameraCaptureOverlay
        stream={null}
        error={null}
        messages={messages}
        onCapture={vi.fn()}
        onClose={vi.fn()}
        onDismissError={vi.fn()}
      />,
    );
    const cancel = screen.getByRole("button", { name: "Cancel" });
    const capture = screen.getByRole("button", { name: "Capture" });
    (capture as HTMLButtonElement).disabled = true;
    cancel.focus();

    const forward = createEvent.keyDown(cancel, { key: "Tab" });
    fireEvent(cancel, forward);

    // Cancel is now the only reachable control: Tab wraps onto itself.
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(cancel);
  });

  it("focuses the dismiss button while an error shows", () => {
    render(
      <CameraCaptureOverlay
        stream={null}
        error="Camera access denied"
        messages={messages}
        onCapture={vi.fn()}
        onClose={vi.fn()}
        onDismissError={vi.fn()}
      />,
    );

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Dismiss" }));
  });

  it("Tab wraps inside the overlay", () => {
    render(
      <CameraCaptureOverlay
        stream={null}
        error={null}
        messages={messages}
        onCapture={vi.fn()}
        onClose={vi.fn()}
        onDismissError={vi.fn()}
      />,
    );
    const cancel = screen.getByRole("button", { name: "Cancel" });
    const capture = screen.getByRole("button", { name: "Capture" });

    // Capture is the last control: Tab goes on to the first one.
    capture.focus();
    const forward = createEvent.keyDown(capture, { key: "Tab" });
    fireEvent(capture, forward);
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(cancel);

    // Shift+Tab on the first control goes back to the last one.
    const backward = createEvent.keyDown(cancel, { key: "Tab", shiftKey: true });
    fireEvent(cancel, backward);
    expect(backward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(capture);

    // In the middle the browser keeps its own order.
    cancel.focus();
    const middle = createEvent.keyDown(cancel, { key: "Tab" });
    fireEvent(cancel, middle);
    expect(middle.defaultPrevented).toBe(false);
  });
});
