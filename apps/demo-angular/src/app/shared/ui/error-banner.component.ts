import { ChangeDetectionStrategy, Component, Input } from "@angular/core";

@Component({
  selector: "app-error-banner",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (message) {
      <div class="cat-status cat-status--error" role="alert">{{ message }}</div>
    }
  `,
})
export class ErrorBannerComponent {
  @Input() message: string | null = null;
}
