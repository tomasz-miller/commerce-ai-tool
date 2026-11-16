import { DEFAULT_COMMERCE_AI_SEARCH_MESSAGES } from "@commerce-ai-tool/core/client";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VoiceStatusBanner } from "./VoiceStatusBanner.js";

const messages = DEFAULT_COMMERCE_AI_SEARCH_MESSAGES;

describe("VoiceStatusBanner", () => {
  it("shows listening state with waveform and timer", () => {
    const { container } = render(
      <VoiceStatusBanner
        isRecording
        isProcessing={false}
        isLoadingTts={false}
        error={null}
        durationSeconds={8}
        messages={messages}
      />,
    );

    const banner = container.querySelector(".cat-voice-banner")!;
    expect(banner.textContent).toContain("Listening…");
    expect(banner.textContent).toContain("0:08");
    expect(banner.textContent).toContain("Tap mic to stop");
    expect(banner.querySelector(".cat-voice-waveform")).not.toBeNull();
    expect(screen.getByRole("timer").textContent).toBe("0:08");
  });

  it("shows processing state", () => {
    const { container } = render(
      <VoiceStatusBanner
        isRecording={false}
        isProcessing
        isLoadingTts={false}
        error={null}
        durationSeconds={0}
        messages={messages}
      />,
    );

    const banner = container.querySelector(".cat-voice-banner")!;
    expect(banner.textContent).toContain("Understanding your query…");
    expect(banner.querySelector(".cat-voice-spinner")).not.toBeNull();
  });

  it("shows TTS loading state", () => {
    const { container } = render(
      <VoiceStatusBanner
        isRecording={false}
        isProcessing={false}
        isLoadingTts
        error={null}
        durationSeconds={0}
        messages={messages}
      />,
    );

    expect(container.querySelector(".cat-voice-banner")!.textContent).toContain(
      "Preparing audio summary…",
    );
  });

  it("shows error state", () => {
    render(
      <VoiceStatusBanner
        isRecording={false}
        isProcessing={false}
        isLoadingTts={false}
        error="Microphone access denied"
        durationSeconds={0}
        messages={messages}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Microphone access denied");
    expect(alert.closest(".cat-voice-banner")!.className).toContain("cat-voice-banner--error");
  });

  it("is not a live region itself: the widget's single live region announces the states", () => {
    const { container } = render(
      <VoiceStatusBanner
        isRecording
        isProcessing={false}
        isLoadingTts={false}
        error={null}
        durationSeconds={3}
        messages={messages}
      />,
    );

    expect(container.querySelector("[aria-live], [role=status], [role=alert]")).toBeNull();
  });

  it("dismisses error when close is clicked", () => {
    const onDismissError = vi.fn();

    render(
      <VoiceStatusBanner
        isRecording={false}
        isProcessing={false}
        isLoadingTts={false}
        error="Search timed out after 20000ms at step: ai_voice_audio"
        durationSeconds={0}
        messages={messages}
        onDismissError={onDismissError}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismissError).toHaveBeenCalledTimes(1);
  });
});
