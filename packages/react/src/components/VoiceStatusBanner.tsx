import { X } from "lucide-react";
import { formatRecordingDuration } from "../hooks/useRecordingDuration.js";
import type { CommerceAISearchMessages } from "@commerce-ai-tool/core";

export interface VoiceStatusBannerProps {
  isRecording: boolean;
  isProcessing: boolean;
  isLoadingTts: boolean;
  error: string | null;
  durationSeconds: number;
  messages: Pick<
    CommerceAISearchMessages,
    "listening" | "tapMicToStop" | "understandingQuery" | "preparingAudioSummary" | "dismiss"
  >;
  onDismissError?: () => void;
}

function VoiceWaveform() {
  return (
    <div className="cat-voice-waveform" aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}

function ProcessingSpinner() {
  return <span className="cat-voice-spinner" aria-hidden="true" />;
}

export function VoiceStatusBanner({
  isRecording,
  isProcessing,
  isLoadingTts,
  error,
  durationSeconds,
  messages,
  onDismissError,
}: VoiceStatusBannerProps) {
  const isError = Boolean(error);

  return (
    <div
      className={`cat-voice-banner ${isError ? "cat-voice-banner--error" : ""}`}
      role="status"
      aria-live="polite"
    >
      {isError && (
        <div className="cat-voice-banner__content">
          <span className="cat-voice-banner__label">{error}</span>
          {onDismissError && (
            <button
              type="button"
              className="cat-voice-banner__dismiss"
              onClick={onDismissError}
              aria-label={messages.dismiss}
            >
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {!isError && isRecording && (
        <div className="cat-voice-banner__content">
          <span className="cat-voice-dot" aria-hidden="true" />
          <span className="cat-voice-banner__label">{messages.listening}</span>
          <VoiceWaveform />
          <span className="cat-voice-banner__timer">{formatRecordingDuration(durationSeconds)}</span>
          <span className="cat-voice-banner__hint">{messages.tapMicToStop}</span>
        </div>
      )}

      {!isError && !isRecording && isProcessing && (
        <div className="cat-voice-banner__content">
          <ProcessingSpinner />
          <span className="cat-voice-banner__label">{messages.understandingQuery}</span>
        </div>
      )}

      {!isError && !isRecording && !isProcessing && isLoadingTts && (
        <div className="cat-voice-banner__content">
          <ProcessingSpinner />
          <span className="cat-voice-banner__label">{messages.preparingAudioSummary}</span>
        </div>
      )}
    </div>
  );
}
