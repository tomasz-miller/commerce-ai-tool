import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VoiceStatusBanner } from "./VoiceStatusBanner.js";

describe("VoiceStatusBanner", () => {
  it("shows listening state with waveform and timer", () => {
    render(
      <VoiceStatusBanner
        isRecording
        isProcessing={false}
        isLoadingTts={false}
        error={null}
        durationSeconds={8}
      />,
    );

    const status = screen.getByRole("status");
    expect(status.textContent).toContain("Listening…");
    expect(status.textContent).toContain("0:08");
    expect(status.textContent).toContain("Tap mic to stop");
    expect(status.querySelector(".cat-voice-waveform")).not.toBeNull();
  });

  it("shows processing state", () => {
    render(
      <VoiceStatusBanner
        isRecording={false}
        isProcessing
        isLoadingTts={false}
        error={null}
        durationSeconds={0}
      />,
    );

    expect(screen.getByRole("status").textContent).toContain("Understanding your query…");
    expect(screen.getByRole("status").querySelector(".cat-voice-spinner")).not.toBeNull();
  });

  it("shows TTS loading state", () => {
    render(
      <VoiceStatusBanner
        isRecording={false}
        isProcessing={false}
        isLoadingTts
        error={null}
        durationSeconds={0}
      />,
    );

    expect(screen.getByRole("status").textContent).toContain("Preparing audio summary…");
  });

  it("shows error state", () => {
    render(
      <VoiceStatusBanner
        isRecording={false}
        isProcessing={false}
        isLoadingTts={false}
        error="Microphone access denied"
        durationSeconds={0}
      />,
    );

    const status = screen.getByRole("status");
    expect(status.textContent).toContain("Microphone access denied");
    expect(status.className).toContain("cat-voice-banner--error");
  });
});
