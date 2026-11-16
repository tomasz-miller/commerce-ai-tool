import { ApplicationRef, Component, createComponent, provideZonelessChangeDetection } from "@angular/core";
import { TestBed, type ComponentFixture } from "@angular/core/testing";
import { BrowserTestingModule, platformBrowserTesting } from "@angular/platform-browser/testing";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveCommerceAISearchMessages } from "@commerce-ai-tool/core/client";
import { CommerceAiCameraOverlayComponent } from "./camera-overlay.component";

beforeAll(() => {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
});

const messages = resolveCommerceAISearchMessages({});

@Component({
  standalone: true,
  imports: [CommerceAiCameraOverlayComponent],
  template: `<dialog commerce-ai-camera-overlay [messages]="messages"></dialog>`,
})
class HostComponent {
  readonly messages = messages;
}

// jsdom has HTMLDialogElement but not showModal() / close().
function stubDialog() {
  const showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  const close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: showModal });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: close });
  return { showModal, close };
}

async function render(
  inputs: Record<string, unknown> = {},
): Promise<ComponentFixture<CommerceAiCameraOverlayComponent>> {
  await TestBed.configureTestingModule({
    imports: [CommerceAiCameraOverlayComponent],
    providers: [provideZonelessChangeDetection()],
  }).compileComponents();
  const fixture = TestBed.createComponent(CommerceAiCameraOverlayComponent);
  fixture.componentRef.setInput("messages", messages);
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  await fixture.whenStable();
  return fixture;
}

const root = (fixture: ComponentFixture<unknown>) => fixture.nativeElement as HTMLElement;

describe("CommerceAiCameraOverlayComponent", () => {
  let dialogApi: ReturnType<typeof stubDialog>;

  beforeEach(() => {
    dialogApi = stubDialog();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
    Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
    document.body.replaceChildren();
  });

  it("is a modal <dialog> named from the messages, opened with showModal()", async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    const fixture = TestBed.createComponent(HostComponent);
    document.body.append(fixture.nativeElement);
    await fixture.whenStable();
    const dialog = (fixture.nativeElement as HTMLElement).firstElementChild as HTMLDialogElement;

    expect(dialog.tagName).toBe("DIALOG");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-label")).toBe(messages.cameraCapture);
    expect(dialog.classList.contains("cat-camera-overlay")).toBe(true);
    expect(dialogApi.showModal).toHaveBeenCalledTimes(1);
    expect(dialog.hasAttribute("open")).toBe(true);
  });

  it("renders the preview with cancel and capture buttons, or the error with a dismiss button", async () => {
    const fixture = await render();
    expect(root(fixture).querySelector("video.cat-camera-preview")).not.toBeNull();
    expect(root(fixture).querySelector(`[aria-label="${messages.cancel}"]`)).not.toBeNull();
    expect(root(fixture).querySelector(`[aria-label="${messages.capturePhoto}"]`)).not.toBeNull();

    fixture.componentRef.setInput("error", "Camera access denied");
    await fixture.whenStable();

    expect(root(fixture).querySelector("video")).toBeNull();
    expect(root(fixture).querySelector('[role="alert"]')?.textContent).toContain("Camera access denied");
  });

  it("emits the user's choices", async () => {
    const fixture = await render();
    const calls: string[] = [];
    fixture.componentInstance.closed.subscribe(() => calls.push("closed"));
    fixture.componentInstance.captured.subscribe(() => calls.push("captured"));
    fixture.componentInstance.errorDismissed.subscribe(() => calls.push("dismissed"));

    (root(fixture).querySelector(`[aria-label="${messages.cancel}"]`) as HTMLElement).click();
    (root(fixture).querySelector(`[aria-label="${messages.capturePhoto}"]`) as HTMLElement).click();
    fixture.componentRef.setInput("error", "boom");
    await fixture.whenStable();
    (root(fixture).querySelector(".cat-camera-overlay__btn") as HTMLElement).click();

    expect(calls).toEqual(["closed", "captured", "dismissed"]);
  });

  it("turns Escape into closed (preview) or errorDismissed (error) instead of closing natively", async () => {
    const fixture = await render();
    const calls: string[] = [];
    fixture.componentInstance.closed.subscribe(() => calls.push("closed"));
    fixture.componentInstance.errorDismissed.subscribe(() => calls.push("dismissed"));

    const first = new Event("cancel", { cancelable: true });
    root(fixture).dispatchEvent(first);
    fixture.componentRef.setInput("error", "boom");
    await fixture.whenStable();
    const second = new Event("cancel", { cancelable: true });
    root(fixture).dispatchEvent(second);

    expect(calls).toEqual(["closed", "dismissed"]);
    expect(first.defaultPrevented).toBe(true);
    expect(second.defaultPrevented).toBe(true);
  });

  it("hands the preview element out, and null once an error replaces it", async () => {
    const fixture = await render();
    const seen: Array<HTMLVideoElement | null> = [];
    fixture.componentInstance.videoChange.subscribe((video) => seen.push(video));
    fixture.componentRef.setInput("messages", resolveCommerceAISearchMessages({ cancel: "Back" }));
    await fixture.whenStable();

    expect(fixture.componentInstance.videoRef()?.nativeElement).toBe(root(fixture).querySelector("video"));

    fixture.componentRef.setInput("error", "boom");
    await fixture.whenStable();

    expect(seen.at(-1)).toBeNull();
  });

  it("closes the dialog and returns focus to the element that was focused when it opened", async () => {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    const fixture = TestBed.createComponent(HostComponent);
    document.body.append(fixture.nativeElement);
    await fixture.whenStable();
    const inside = (fixture.nativeElement as HTMLElement).querySelector("button") as HTMLButtonElement;
    inside.focus();
    expect(document.activeElement).toBe(inside);

    fixture.destroy();

    expect(dialogApi.close).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(trigger);
  });

  it("prefers the explicit return target over the previously focused element", async () => {
    const opener = document.createElement("button");
    const target = document.createElement("button");
    document.body.append(opener, target);
    opener.focus();
    const fixture = await render({ returnFocusTo: target });

    fixture.destroy();

    expect(document.activeElement).toBe(target);
  });

  async function renderAttached() {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    const fixture = TestBed.createComponent(HostComponent);
    document.body.append(fixture.nativeElement);
    await fixture.whenStable();
    return fixture;
  }

  it("camera overlay focuses the capture button on open and returns focus on close", async () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();

    const fixture = await renderAttached();

    expect(document.activeElement).toBe(
      (fixture.nativeElement as HTMLElement).querySelector(`[aria-label="${messages.capturePhoto}"]`),
    );

    fixture.destroy();

    expect(dialogApi.close).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(opener);
  });

  it("falls back to the search field when the camera button is disabled after a capture", async () => {
    const camera = document.createElement("button");
    const searchField = document.createElement("input");
    document.body.append(camera, searchField);
    camera.focus();
    const fixture = await render({ returnFocusTo: camera, fallbackFocusTo: searchField });
    document.body.append(fixture.nativeElement);
    // The capture starts an image search, which disables the camera button.
    camera.disabled = true;

    fixture.destroy();

    expect(document.activeElement).toBe(searchField);
  });

  it("moves focus on to the search field when the camera button is disabled right after the overlay closes", async () => {
    const camera = document.createElement("button");
    const searchField = document.createElement("input");
    document.body.append(camera, searchField);
    camera.focus();
    const fixture = await render({ returnFocusTo: camera, fallbackFocusTo: searchField });
    document.body.append(fixture.nativeElement);

    fixture.destroy();
    expect(document.activeElement).toBe(camera);
    // The page re-renders after the overlay is gone and only then disables the camera button.
    camera.disabled = true;
    TestBed.inject(ApplicationRef).tick();

    expect(document.activeElement).toBe(searchField);
  });

  it("does not throw when the application is destroyed while the overlay is open", async () => {
    const { createApplication } = await import("@angular/platform-browser");
    const app = await createApplication({ providers: [provideZonelessChangeDetection()] });
    const host = document.createElement("dialog");
    document.body.append(host);
    const ref = createComponent(CommerceAiCameraOverlayComponent, {
      environmentInjector: app.injector,
      hostElement: host,
    });
    ref.setInput("messages", messages);
    app.attachView(ref.hostView);
    ref.changeDetectorRef.detectChanges();
    await app.whenStable();
    expect(dialogApi.showModal).toHaveBeenCalled();

    expect(() => app.destroy()).not.toThrow();
    expect(app.destroyed).toBe(true);
  });

  it("skips disabled controls when wrapping Tab", async () => {
    const fixture = await renderAttached();
    const dialog = (fixture.nativeElement as HTMLElement).firstElementChild as HTMLElement;
    const cancel = dialog.querySelector(`[aria-label="${messages.cancel}"]`) as HTMLButtonElement;
    const capture = dialog.querySelector(`[aria-label="${messages.capturePhoto}"]`) as HTMLButtonElement;
    capture.disabled = true;
    cancel.focus();

    const forward = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    cancel.dispatchEvent(forward);

    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(cancel);
  });

  it("focuses the dismiss button when an error replaces the preview", async () => {
    document.body.append(document.createElement("button"));
    const fixture = await render();
    document.body.append(fixture.nativeElement);
    fixture.componentRef.setInput("error", "boom");
    await fixture.whenStable();

    expect(document.activeElement).toBe(root(fixture).querySelector(".cat-camera-overlay__error button"));
  });

  it("Tab wraps inside the overlay", async () => {
    const fixture = await renderAttached();
    const dialog = (fixture.nativeElement as HTMLElement).firstElementChild as HTMLElement;
    const cancel = dialog.querySelector(`[aria-label="${messages.cancel}"]`) as HTMLElement;
    const capture = dialog.querySelector(`[aria-label="${messages.capturePhoto}"]`) as HTMLElement;

    capture.focus();
    const forward = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    capture.dispatchEvent(forward);
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(cancel);

    const backward = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
    cancel.dispatchEvent(backward);
    expect(backward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(capture);

    cancel.focus();
    const middle = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    cancel.dispatchEvent(middle);
    expect(middle.defaultPrevented).toBe(false);
  });
});
