import { describe, expect, it } from "vitest";
import {
  checkoutCountryCodes,
  countryLabel,
  createEmptyAddress,
  isAddressComplete,
} from "./checkout-address.js";

describe("checkout-address", () => {
  it("creates an empty address for the given country", () => {
    expect(createEmptyAddress("PL")).toEqual({
      firstName: "",
      lastName: "",
      streetName: "",
      postalCode: "",
      city: "",
      country: "PL",
    });
  });

  it("detects incomplete addresses", () => {
    expect(isAddressComplete(createEmptyAddress("DE"))).toBe(false);
    expect(
      isAddressComplete({
        firstName: "Ada",
        lastName: "Lovelace",
        streetName: "Main Street",
        postalCode: "10115",
        city: "Berlin",
        country: "DE",
      }),
    ).toBe(true);
  });

  it("keeps an unknown selected country in the list", () => {
    const codes = checkoutCountryCodes("jp");
    expect(codes).toContain("JP");
    expect([...codes].sort()).toEqual(codes);
  });

  it("labels countries in the requested locale", () => {
    expect(countryLabel("DE", "en")).toBe("Germany");
    expect(countryLabel("XX")).toBe("XX");
  });
});
