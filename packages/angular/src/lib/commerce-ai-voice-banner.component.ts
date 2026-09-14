import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from "@angular/core";
import type { CommerceAISearchMessages } from "@commerce-ai-tool/core/client";
import { formatRecordingDuration } from "./recording-duration.js";

@Component({
  selector: "commerce-ai-voice-banner",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="cat-voice-banner"
      [class.cat-voice-banner--error]="isError"
      role="status"
      aria-live="polite"
    >
      @if (isError) {
        <div class="cat-voice-banner__content">
          <span class="cat-voice-banner__label">{{ error }}</span>
          <button
            type="button"
            class="cat-voice-banner__dismiss"
            [attr.aria-label]="messages.dismiss"
            (click)="dismissError.emit()"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
      } @else if (isRecording) {
        <div class="cat-voice-banner__content">
          <span class="cat-voice-dot" aria-hidden="true"></span>
          <span class="cat-voice-banner__label">{{ messages.listening }}</span>
          <div class="cat-voice-waveform" aria-hidden="true">
            <span></span>
            <span></span>
            <span></span>
            <span></span>
            <span></span>
          </div>
          <span class="cat-voice-banner__timer">{{ formattedDuration }}</span>
          <span class="cat-voice-banner__hint">{{ messages.tapMicToStop }}</span>
        </div>
      } @else if (isProcessing) {
        <div class="cat-voice-banner__content">
          <span class="cat-voice-spinner" aria-hidden="true"></span>
          <span class="cat-voice-banner__label">{{ messages.understandingQuery }}</span>
        </div>
      } @else if (isLoadingTts) {
        <div class="cat-voice-banner__content">
          <span class="cat-voice-spinner" aria-hidden="true"></span>
          <span class="cat-voice-banner__label">{{ messages.preparingAudioSummary }}</span>
        </div>
      }
    </div>
  `,
})
export class CommerceAiVoiceBannerComponent {
  @Input() isRecording = false;
  @Input() isProcessing = false;
  @Input() isLoadingTts = false;
  @Input() error: string | null = null;
  @Input() durationSeconds = 0;
  @Input({ required: true }) messages!: Pick<
    CommerceAISearchMessages,
    "listening" | "tapMicToStop" | "understandingQuery" | "preparingAudioSummary" | "dismiss"
  >;
  @Output() dismissError = new EventEmitter<void>();

  get isError(): boolean {
    return Boolean(this.error);
  }

  get formattedDuration(): string {
    return formatRecordingDuration(this.durationSeconds);
  }
}
