import { Component } from "@angular/core";
import {
  CommerceAiCartPanelComponent,
  CommerceAiMissionResultsComponent,
  CommerceAiSearchComponent,
  DEFAULT_COMMERCE_AI_SEARCH_MESSAGES,
  type CommerceAISearchMessages,
} from "@commerce-ai-tool/angular";
import type { CartSnapshot, MissionSearchResult, ProductCard } from "@commerce-ai-tool/core/client";

// Compiled with `strictTemplates` against the packed typings: `messages` on the cart panel and
// the mission results is declared with a transform, so the template binds the host-facing
// CommerceAISearchMessages type even though the class field holds the resolved type.
@Component({
  selector: "app-root",
  imports: [CommerceAiSearchComponent, CommerceAiCartPanelComponent, CommerceAiMissionResultsComponent],
  template: `
    <commerce-ai-search
      apiBaseUrl="/api/commerce-ai"
      theme="auto"
      currency="EUR"
      country="DE"
      [enableMissions]="true"
      [enableCart]="true"
      [messages]="searchMessages"
      (productSelect)="onSelect($event)"
      (cartChange)="onCartChange($event)"
      (checkout)="onCheckout($event)"
    />
    <commerce-ai-cart-panel [cart]="null" [messages]="messages" />
    <commerce-ai-mission-results [mission]="mission" [messages]="messages" />
  `,
})
export class AppComponent {
  readonly searchMessages: Partial<CommerceAISearchMessages> = { placeholder: "Search shop" };
  readonly messages: CommerceAISearchMessages = DEFAULT_COMMERCE_AI_SEARCH_MESSAGES;
  readonly mission!: MissionSearchResult;

  onSelect(product: ProductCard): void {
    console.log(product.id);
  }

  onCartChange(cart: CartSnapshot | null): void {
    console.log(cart?.id);
  }

  onCheckout(cart: CartSnapshot): void {
    console.log(cart.id);
  }
}
