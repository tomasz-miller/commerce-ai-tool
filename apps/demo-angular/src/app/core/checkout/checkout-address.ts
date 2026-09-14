import type { CheckoutAddress } from "@commerce-ai-tool/core/client";

export const CHECKOUT_COUNTRY_CODES = [
  "AT",
  "BE",
  "CH",
  "CZ",
  "DE",
  "DK",
  "ES",
  "FI",
  "FR",
  "GB",
  "IE",
  "IT",
  "NL",
  "NO",
  "PL",
  "PT",
  "SE",
  "US",
] as const;

const REQUIRED_ADDRESS_FIELDS = [
  "firstName",
  "lastName",
  "streetName",
  "postalCode",
  "city",
  "country",
] as const satisfies Array<keyof CheckoutAddress>;

export function createEmptyAddress(country: string): CheckoutAddress {
  return {
    firstName: "",
    lastName: "",
    streetName: "",
    postalCode: "",
    city: "",
    country,
  };
}

export function isAddressComplete(address: CheckoutAddress): boolean {
  return REQUIRED_ADDRESS_FIELDS.every((field) => address[field].trim().length > 0);
}

export function checkoutCountryCodes(selected: string): string[] {
  const codes = new Set<string>(CHECKOUT_COUNTRY_CODES);
  const normalized = selected.trim().toUpperCase();
  if (normalized.length === 2) {
    codes.add(normalized);
  }
  return [...codes].sort();
}

export function countryLabel(code: string, locale = "en"): string {
  try {
    return new Intl.DisplayNames([locale, "en"], { type: "region" }).of(code) ?? code;
  } catch {
    try {
      return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
    } catch {
      return code;
    }
  }
}
