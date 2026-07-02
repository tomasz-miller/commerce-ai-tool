import {
  Component,
  EventEmitter,
  Input,
  Output,
  ViewEncapsulation,
  inject,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import type { ProductCard, ThemeMode } from "@commerce-ai-tool/core";
import { CommerceAiApiService } from "./commerce-ai-api.service.js";

type SearchMode = "text" | "image" | "voice" | null;

@Component({
  selector: "commerce-ai-search",
  standalone: true,
  imports: [FormsModule],
  template: `
    <div
      class="cat-root cat-wrapper"
      [attr.data-theme]="theme"
      role="search"
      aria-label="Product search"
      (dragover)="onDragOver($event)"
      (dragleave)="isDragging = false"
      (drop)="onDrop($event)"
    >
      @if (isDragging && enableImageSearch) {
        <div class="cat-drag-overlay" aria-hidden="true">Drop image to search</div>
      }

      <form class="cat-search-bar" (ngSubmit)="onSubmit()">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>

        <input
          type="search"
          class="cat-search-input"
          [(ngModel)]="query"
          name="query"
          [placeholder]="placeholder"
          aria-label="Search query"
          autocomplete="off"
          (ngModelChange)="onQueryChange($event)"
        />

        @if (enableVoice) {
          <button
            type="button"
            class="cat-icon-btn"
            [class.cat-icon-btn--active]="isRecording"
            [disabled]="isProcessing"
            [attr.aria-label]="isRecording ? 'Stop recording' : 'Voice search'"
            [attr.aria-pressed]="isRecording"
            (click)="toggleRecording()"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </svg>
          </button>
        }

        @if (enableImageSearch) {
          <button
            type="button"
            class="cat-icon-btn"
            [disabled]="isLoading"
            aria-label="Search by image"
            (click)="fileInput.click()"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
              <circle cx="9" cy="9" r="2" />
              <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
            </svg>
          </button>
          <input
            #fileInput
            type="file"
            accept="image/*"
            class="cat-hidden-input"
            (change)="onFileSelected($event)"
          />
        }

        @if (showVoiceReplay) {
          <button
            type="button"
            class="cat-icon-btn"
            aria-label="Replay voice result summary"
            (click)="replayVoiceSummary()"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
          </button>
        }
      </form>

      @if (showResults) {
        <div class="cat-results" role="listbox" aria-label="Search results">
          @if (isLoading) {
            <div class="cat-status">Searching...</div>
          }
          @if (error) {
            <div class="cat-status cat-status--error">{{ error }}</div>
          }

          @for (product of results; track product.id) {
            <button
              type="button"
              class="cat-result-item"
              role="option"
              (click)="productSelect.emit(product)"
            >
              @if (product.imageUrl) {
                <img [src]="product.imageUrl" alt="" class="cat-result-image" loading="lazy" />
              } @else {
                <div class="cat-result-image cat-result-image--placeholder">📦</div>
              }
              <div class="cat-result-info">
                <div class="cat-result-name">{{ product.name }}</div>
                @if (product.price) {
                  <div class="cat-result-price">{{ product.price.formatted }}</div>
                }
              </div>
            </button>
          }

          @if (!isLoading && !error && results.length === 0 && query) {
            <div class="cat-status">No products found</div>
          }
        </div>
      }
    </div>
  `,
  encapsulation: ViewEncapsulation.None,
})
export class CommerceAiSearchComponent {
  private readonly api = inject(CommerceAiApiService);

  @Input() apiBaseUrl = "/api/commerce-ai";
  @Input() theme: ThemeMode = "auto";
  @Input() catalogLocale?: string;
  @Input() queryLocale?: string;
  /** @deprecated Use queryLocale */
  @Input() locale?: string;
  @Input() placeholder = "Search products...";
  @Input() enableVoice = true;
  @Input() enableImageSearch = true;
  @Input() enableTts = true;

  @Output() productSelect = new EventEmitter<ProductCard>();

  query = "";
  results: ProductCard[] = [];
  meta: { queryInterpretation?: string } | null = null;
  isLoading = false;
  error: string | null = null;
  isDragging = false;
  isRecording = false;
  isProcessing = false;
  lastSearchMode: SearchMode = null;
  audioSummary: string | null = null;

  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private searchAbort: AbortController | null = null;
  private searchRequestId = 0;

  get showResults(): boolean {
    return (
      this.query.trim().length > 0 &&
      (this.results.length > 0 || this.isLoading || !!this.error)
    );
  }

  get showVoiceReplay(): boolean {
    return this.enableTts && this.lastSearchMode === "voice" && !!this.audioSummary;
  }

  onQueryChange(value: string): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed.length < 2) {
      this.lastSearchMode = null;
      this.clearVoiceAudio();
      this.clearResults();
      return;
    }

    this.lastSearchMode = "text";
    this.clearVoiceAudio();
    this.isLoading = true;
    this.error = null;
    this.results = [];
    this.meta = null;

    this.debounceTimer = setTimeout(() => this.onSubmit(), 250);
  }

  private clearResults(): void {
    this.searchAbort?.abort();
    this.searchAbort = null;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.results = [];
    this.meta = null;
    this.error = null;
    this.isLoading = false;
  }

  private get localeFields() {
    return {
      catalogLocale: this.catalogLocale,
      queryLocale: this.queryLocale,
      locale: this.locale,
    };
  }

  onSubmit(): void {
    const q = this.query.trim();
    if (!q) return;

    this.lastSearchMode = "text";
    this.clearVoiceAudio();

    this.searchAbort?.abort();
    const controller = new AbortController();
    this.searchAbort = controller;
    const requestId = ++this.searchRequestId;

    this.isLoading = true;
    this.error = null;
    this.results = [];
    this.meta = null;

    void this.api.search(this.apiBaseUrl, q, this.localeFields, controller.signal).then(
      (data) => {
        if (requestId !== this.searchRequestId) return;
        this.results = data.products;
        this.meta = data.meta;
        this.isLoading = false;
      },
      (err: Error) => {
        if (err.name === "AbortError") return;
        if (requestId !== this.searchRequestId) return;
        this.error = err.message;
        this.results = [];
        this.meta = null;
        this.isLoading = false;
      },
    );
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) void this.searchByImage(file);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = true;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = false;
    const file = event.dataTransfer?.files[0];
    if (file) void this.searchByImage(file);
  }

  searchByImage(file: File): void {
    if (!file.type.startsWith("image/")) return;

    this.lastSearchMode = "image";
    this.clearVoiceAudio();

    this.searchAbort?.abort();
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    this.isLoading = true;
    this.error = null;
    this.results = [];
    this.meta = null;

    void this.api.searchByImage(this.apiBaseUrl, file, this.localeFields).then(
      (data) => {
        this.results = data.products;
        this.meta = data.meta;
        if (data.interpretation) this.query = data.interpretation;
        this.isLoading = false;
      },
      (err: Error) => {
        this.error = err.message;
        this.isLoading = false;
      },
    );
  }

  async toggleRecording(): Promise<void> {
    if (this.isRecording) {
      this.mediaRecorder?.stop();
      this.isRecording = false;
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream);
      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.audioChunks.push(e.data);
      };

      this.mediaRecorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(this.audioChunks, { type: "audio/webm" });
        this.isProcessing = true;
        this.clearVoiceAudio();

        void this.api
          .searchByVoice(this.apiBaseUrl, blob, this.localeFields, this.enableTts)
          .then(async (data) => {
            this.lastSearchMode = "voice";
            this.query = data.transcript;
            this.results = data.products;
            this.meta = data.meta;
            this.error = null;
            if (data.audioSummary) {
              this.audioSummary = data.audioSummary;
              const audio = new Audio(`data:audio/mpeg;base64,${data.audioSummary}`);
              void audio.play();
            } else if (this.enableTts && data.ttsText && data.ttsPending) {
              try {
                const blob = await this.api.synthesizeSpeech(this.apiBaseUrl, data.ttsText);
                const buffer = await blob.arrayBuffer();
                const bytes = new Uint8Array(buffer);
                let binary = "";
                for (let i = 0; i < bytes.length; i++) {
                  binary += String.fromCharCode(bytes[i]!);
                }
                this.audioSummary = btoa(binary);
                const audio = new Audio(`data:audio/mpeg;base64,${this.audioSummary}`);
                void audio.play();
              } catch {
                this.audioSummary = null;
              }
            }
          })
          .catch((err: Error) => {
            this.error = err.message;
          })
          .finally(() => {
            this.isProcessing = false;
          });
      };

      this.mediaRecorder.start();
      this.isRecording = true;
    } catch {
      this.error = "Microphone access denied";
    }
  }

  replayVoiceSummary(): void {
    if (!this.audioSummary) return;

    const audio = new Audio(`data:audio/mpeg;base64,${this.audioSummary}`);
    void audio.play();
  }

  private clearVoiceAudio(): void {
    this.audioSummary = null;
  }
}
