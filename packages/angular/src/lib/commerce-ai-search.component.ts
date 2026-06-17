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

        @if (enableTts && meta?.queryInterpretation) {
          <button
            type="button"
            class="cat-icon-btn"
            aria-label="Read interpretation aloud"
            (click)="playTts()"
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
  @Input() locale = "en";
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

  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  get showResults(): boolean {
    return this.results.length > 0 || this.isLoading || !!this.error;
  }

  onQueryChange(value: string): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (value.trim().length >= 2) {
      this.debounceTimer = setTimeout(() => void this.onSubmit(), 300);
    }
  }

  onSubmit(): void {
    const q = this.query.trim();
    if (!q) return;

    this.isLoading = true;
    this.error = null;

    void this.api.search(this.apiBaseUrl, q, this.locale).then(
      (data) => {
        this.results = data.products;
        this.meta = data.meta;
        this.isLoading = false;
      },
      (err: Error) => {
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

    this.isLoading = true;
    this.error = null;

    void this.api.searchByImage(this.apiBaseUrl, file, this.locale).then(
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

        void this.api
          .searchByVoice(this.apiBaseUrl, blob, this.locale, this.enableTts)
          .then((data) => {
            this.query = data.transcript;
            this.results = data.products;
            this.meta = data.meta;
            this.error = null;
            if (data.audioSummary) {
              const audio = new Audio(`data:audio/mpeg;base64,${data.audioSummary}`);
              void audio.play();
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

  playTts(): void {
    const text = this.meta?.queryInterpretation;
    if (!text) return;

    void this.api.synthesizeSpeech(this.apiBaseUrl, text).then((blob) => {
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      void audio.play();
    });
  }
}
