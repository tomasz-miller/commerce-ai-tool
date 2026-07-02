import { formatRecordingDuration } from "../hooks/useRecordingDuration.js";

export interface VoiceStatusBannerProps {
  isRecording: boolean;
  isProcessing: boolean;
  isLoadingTts: boolean;
  error: string | null;
  durationSeconds: number;
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
        </div>
      )}

      {!isError && isRecording && (
        <div className="cat-voice-banner__content">
          <span className="cat-voice-dot" aria-hidden="true" />
          <span className="cat-voice-banner__label">Listening…</span>
          <VoiceWaveform />
          <span className="cat-voice-banner__timer">{formatRecordingDuration(durationSeconds)}</span>
          <span className="cat-voice-banner__hint">Tap mic to stop</span>
        </div>
      )}

      {!isError && !isRecording && isProcessing && (
        <div className="cat-voice-banner__content">
          <ProcessingSpinner />
          <span className="cat-voice-banner__label">Understanding your query…</span>
        </div>
      )}

      {!isError && !isRecording && !isProcessing && isLoadingTts && (
        <div className="cat-voice-banner__content">
          <ProcessingSpinner />
          <span className="cat-voice-banner__label">Preparing audio summary…</span>
        </div>
      )}
    </div>
  );
}
