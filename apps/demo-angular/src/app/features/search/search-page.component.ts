import { ChangeDetectionStrategy, Component, inject, signal } from "@angular/core";
import { Router } from "@angular/router";
import { CommerceAiSearchComponent } from "@commerce-ai-tool/angular";
import type { ProductCard } from "@commerce-ai-tool/core/client";
import { DEMO_CONFIG } from "../../core/config/demo-config.js";
import { ProductPreviewSheetComponent } from "../product-preview/product-preview-sheet.component.js";

@Component({
  selector: "app-search-page",
  standalone: true,
  imports: [CommerceAiSearchComponent, ProductPreviewSheetComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main id="main" class="demo-page">
      <div class="demo-hero">
        <p class="demo-hero-eyebrow">Commercetools · AI search</p>
        <h1 class="demo-hero-title">
          <span class="demo-hero-word demo-hero-word--muted">Commerce</span>
          <span class="demo-hero-word demo-hero-word--emphasis">AI tool</span>
        </h1>
        <p>Search the catalog by text, voice, or image — then take the cart through checkout.</p>
      </div>

      <div id="demo-search" class="demo-search" [attr.inert]="selectedProduct() ? '' : null">
        <commerce-ai-search
          [apiBaseUrl]="config.apiBaseUrl"
          [theme]="config.theme"
          [catalogLocale]="config.catalogLocale"
          [queryLocale]="config.queryLocale"
          [currency]="config.currency"
          [country]="config.country"
          [enableAutocomplete]="true"
          [enableFacets]="true"
          [enableVoice]="true"
          [enableImageSearch]="true"
          [enableCameraSearch]="true"
          [enableTts]="true"
          [enableCart]="true"
          [enableMissions]="true"
          (checkout)="goToCheckout()"
          (productSelect)="openPreview($event)"
        />
      </div>
      @if (selectedProduct(); as product) {
        <app-product-preview-sheet [product]="product" (close)="selectedProduct.set(null)" />
      }
    </main>
  `,
})
export class SearchPageComponent {
  protected readonly config = inject(DEMO_CONFIG);
  private readonly router = inject(Router);
  protected readonly selectedProduct = signal<ProductCard | null>(null);

  protected goToCheckout(): void {
    void this.router.navigate(["/checkout"]);
  }

  protected openPreview(product: ProductCard): void {
    this.selectedProduct.set(product);
  }
}
