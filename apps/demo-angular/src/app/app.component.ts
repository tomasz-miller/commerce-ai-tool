import { ChangeDetectionStrategy, Component } from "@angular/core";
import { RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="demo-skip" href="#main">Skip to content</a>
    <nav class="demo-nav" aria-label="Demo">
      <a
        routerLink="/"
        routerLinkActive
        [routerLinkActiveOptions]="{ exact: true }"
        ariaCurrentWhenActive="page"
      >
        Search
      </a>
      <a routerLink="/checkout" routerLinkActive ariaCurrentWhenActive="page">Checkout</a>
      <a routerLink="/orders" routerLinkActive ariaCurrentWhenActive="page">Orders</a>
    </nav>
    <router-outlet />
  `,
})
export class AppComponent {}
