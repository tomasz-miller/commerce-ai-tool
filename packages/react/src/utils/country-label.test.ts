import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { countryLabel, resetCountryLabelCache } from "./country-label.js";

describe("countryLabel", () => {
  const RealDisplayNames = Intl.DisplayNames;
  let constructed: number;

  beforeEach(() => {
    resetCountryLabelCache();
    constructed = 0;
    class CountingDisplayNames extends RealDisplayNames {
      constructor(...args: ConstructorParameters<typeof Intl.DisplayNames>) {
        super(...args);
        constructed += 1;
      }
    }
    vi.spyOn(Intl, "DisplayNames").mockImplementation(
      CountingDisplayNames as unknown as typeof Intl.DisplayNames,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetCountryLabelCache();
  });

  it("builds one formatter per locale however many labels are read", () => {
    for (const code of ["DE", "FR", "PL", "US", "GB"]) countryLabel(code, "en");
    for (const code of ["DE", "FR", "PL"]) countryLabel(code, "pl");
    expect(constructed).toBe(2);
  });

  it("returns localised names with an English fallback", () => {
    expect(countryLabel("DE", "en")).toBe("Germany");
    expect(countryLabel("DE", "pl")).toBe("Niemcy");
    expect(countryLabel("DE", "not a locale")).toBe("Germany");
  });

  it("falls back to the code when the name cannot be resolved", () => {
    expect(countryLabel("not-a-region", "en")).toBe("not-a-region");
  });

  it("falls back to the code when Intl.DisplayNames is unavailable", () => {
    resetCountryLabelCache();
    vi.spyOn(Intl, "DisplayNames").mockImplementation(() => {
      throw new Error("unsupported");
    });
    expect(countryLabel("DE", "en")).toBe("DE");
  });

  it("keeps the cache bounded", () => {
    const locales = ["en", "pl", "de", "fr", "es", "it", "nl", "pt", "sv", "fi"];
    for (const locale of locales) countryLabel("DE", locale);
    expect(constructed).toBe(locales.length);
    // "en" was the oldest entry and has been evicted; "fi" is still cached.
    countryLabel("DE", "en");
    expect(constructed).toBe(locales.length + 1);
    countryLabel("DE", "fi");
    expect(constructed).toBe(locales.length + 1);
  });
});
