import { afterEach, describe, expect, it, vi } from "vitest";
import { currencyFractionDigits } from "./currency.js";

describe("currencyFractionDigits", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads ISO 4217 digits and falls back to 2", () => {
    expect(currencyFractionDigits("EUR")).toBe(2);
    expect(currencyFractionDigits("JPY")).toBe(0);
    expect(currencyFractionDigits("KWD")).toBe(3);
    expect(currencyFractionDigits(undefined)).toBe(2);
    expect(currencyFractionDigits("not a code")).toBe(2);
  });

  it("builds one Intl.NumberFormat per currency code", () => {
    const spy = vi.spyOn(Intl, "NumberFormat");
    currencyFractionDigits("CLP");
    currencyFractionDigits("CLP");
    currencyFractionDigits("CLP");
    expect(spy.mock.calls.filter(([, options]) => options?.currency === "CLP")).toHaveLength(1);
  });
});
