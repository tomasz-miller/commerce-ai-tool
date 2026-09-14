import "zone.js";
import "zone.js/testing";
import { TestBed } from "@angular/core/testing";
import { BrowserTestingModule, platformBrowserTesting } from "@angular/platform-browser/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DEFAULT_COMMERCE_AI_SEARCH_MESSAGES } from "@commerce-ai-tool/core/client";
import { CommerceAiVoiceBannerComponent } from "./commerce-ai-voice-banner.component.js";

beforeAll(() => {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
});

const messages = DEFAULT_COMMERCE_AI_SEARCH_MESSAGES;

describe("CommerceAiVoiceBannerComponent", () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it("shows listening state with waveform and timer", async () => {
    await TestBed.configureTestingModule({
      imports: [CommerceAiVoiceBannerComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(CommerceAiVoiceBannerComponent);
    fixture.componentInstance.isRecording = true;
    fixture.componentInstance.durationSeconds = 8;
    fixture.componentInstance.messages = messages;
    fixture.detectChanges();

    const status = fixture.nativeElement.querySelector('[role="status"]') as HTMLElement;
    expect(status.textContent).toContain("Listening…");
    expect(status.textContent).toContain("0:08");
    expect(status.textContent).toContain("Tap mic to stop");
    expect(status.querySelector(".cat-voice-waveform")).not.toBeNull();
  });

  it("shows processing state", async () => {
    await TestBed.configureTestingModule({
      imports: [CommerceAiVoiceBannerComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(CommerceAiVoiceBannerComponent);
    fixture.componentInstance.isProcessing = true;
    fixture.componentInstance.messages = messages;
    fixture.detectChanges();

    const status = fixture.nativeElement.querySelector('[role="status"]') as HTMLElement;
    expect(status.textContent).toContain("Understanding your query…");
    expect(status.querySelector(".cat-voice-spinner")).not.toBeNull();
  });

  it("shows TTS loading state", async () => {
    await TestBed.configureTestingModule({
      imports: [CommerceAiVoiceBannerComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(CommerceAiVoiceBannerComponent);
    fixture.componentInstance.isLoadingTts = true;
    fixture.componentInstance.messages = messages;
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="status"]')?.textContent).toContain(
      "Preparing audio summary…",
    );
  });

  it("shows error state", async () => {
    await TestBed.configureTestingModule({
      imports: [CommerceAiVoiceBannerComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(CommerceAiVoiceBannerComponent);
    fixture.componentInstance.error = "Microphone access denied";
    fixture.componentInstance.messages = messages;
    fixture.detectChanges();

    const status = fixture.nativeElement.querySelector('[role="status"]') as HTMLElement;
    expect(status.textContent).toContain("Microphone access denied");
    expect(status.className).toContain("cat-voice-banner--error");
  });

  it("dismisses error when close is clicked", async () => {
    await TestBed.configureTestingModule({
      imports: [CommerceAiVoiceBannerComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(CommerceAiVoiceBannerComponent);
    fixture.componentInstance.error = "Search timed out after 20000ms at step: ai_voice_audio";
    fixture.componentInstance.messages = messages;
    const dismiss = vi.fn();
    fixture.componentInstance.dismissError.subscribe(dismiss);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector(
      'button[aria-label="Dismiss"]',
    ) as HTMLButtonElement;
    button.click();
    fixture.detectChanges();

    expect(dismiss).toHaveBeenCalledTimes(1);
  });
});
