import { ChangeDetectionStrategy, Component } from "@angular/core";

@Component({
  selector: "app-loading-spinner",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p class="cat-status" role="status"><ng-content /></p>`,
})
export class LoadingSpinnerComponent {}
