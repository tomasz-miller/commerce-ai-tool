import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from "@angular/core";
import { FormsModule } from "@angular/forms";
import type { CheckoutAddress } from "@commerce-ai-tool/core/client";
import { checkoutCountryCodes, countryLabel } from "../../core/checkout/checkout-address.js";

@Component({
  selector: "app-address-fields",
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="cat-checkout__address-grid">
      <label class="cat-checkout__field">
        <span>First name</span>
        <input
          [name]="prefix + '-firstName'"
          autocomplete="given-name"
          required
          [ngModel]="address.firstName"
          (ngModelChange)="update('firstName', $event)"
        />
      </label>
      <label class="cat-checkout__field">
        <span>Last name</span>
        <input
          [name]="prefix + '-lastName'"
          autocomplete="family-name"
          required
          [ngModel]="address.lastName"
          (ngModelChange)="update('lastName', $event)"
        />
      </label>
      <label class="cat-checkout__field cat-checkout__field--wide">
        <span>Street</span>
        <input
          [name]="prefix + '-streetName'"
          autocomplete="address-line1"
          required
          [ngModel]="address.streetName"
          (ngModelChange)="update('streetName', $event)"
        />
      </label>
      <label class="cat-checkout__field">
        <span>Postal code</span>
        <input
          [name]="prefix + '-postalCode'"
          autocomplete="postal-code"
          required
          [ngModel]="address.postalCode"
          (ngModelChange)="update('postalCode', $event)"
        />
      </label>
      <label class="cat-checkout__field">
        <span>City</span>
        <input
          [name]="prefix + '-city'"
          autocomplete="address-level2"
          required
          [ngModel]="address.city"
          (ngModelChange)="update('city', $event)"
        />
      </label>
      <label class="cat-checkout__field">
        <span>Country</span>
        <select
          [name]="prefix + '-country'"
          autocomplete="country"
          required
          [ngModel]="address.country"
          (ngModelChange)="update('country', ($event ?? '').toUpperCase())"
        >
          @for (code of countryCodes; track code) {
            <option [value]="code">{{ countryName(code) }}</option>
          }
        </select>
      </label>
    </div>
  `,
})
export class AddressFieldsComponent {
  @Input({ required: true }) address!: CheckoutAddress;
  @Input() prefix = "address";
  @Input() locale = "en";
  @Output() addressChange = new EventEmitter<CheckoutAddress>();

  protected get countryCodes(): string[] {
    return checkoutCountryCodes(this.address.country);
  }

  protected countryName(code: string): string {
    return countryLabel(code, this.locale);
  }

  protected update(field: keyof CheckoutAddress, value: string): void {
    this.addressChange.emit({ ...this.address, [field]: value });
  }
}
