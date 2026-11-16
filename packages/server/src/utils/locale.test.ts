import { afterEach, describe, expect, it, vi } from "vitest";
import { canonicalizeSupportedLocales, normalizeLocale, parseSearchLocaleOptions } from "./locale.js";

describe("normalizeLocale", () => {
  it("falls back for 'xx_INVALID!!'", () => {
    expect(normalizeLocale("xx_INVALID!!", undefined, "en")).toBe("en");
  });

  it("falls back for underscore locales and non-strings", () => {
    expect(normalizeLocale("en_GB", undefined, "en")).toBe("en");
    expect(normalizeLocale(undefined, undefined, "en")).toBe("en");
    expect(normalizeLocale(42, undefined, "en")).toBe("en");
    expect(normalizeLocale("   ", undefined, "en")).toBe("en");
    expect(normalizeLocale("x", undefined, "en")).toBe("en");
  });

  it("falls back for oversized input", () => {
    expect(normalizeLocale(`en-${"a".repeat(500)}`, undefined, "en")).toBe("en");
  });

  it("returns the canonical form when no allowlist is configured", () => {
    expect(normalizeLocale(" de-de ", undefined, "en")).toBe("de-DE");
    expect(normalizeLocale("en", undefined, "de")).toBe("en");
  });

  it("keeps de-DE when allowed", () => {
    expect(normalizeLocale("de-DE", ["de-DE", "en-GB"], "en-GB")).toBe("de-DE");
  });

  it("matches the allowlist case-insensitively and returns its canonical form", () => {
    expect(normalizeLocale("de-de", ["de-DE"], "en-GB")).toBe("de-DE");
    expect(normalizeLocale("DE-DE", ["de-DE"], "en-GB")).toBe("de-DE");
  });

  it("falls back for well-formed locales outside the allowlist", () => {
    expect(normalizeLocale("fr-FR", ["de-DE"], "en-GB")).toBe("en-GB");
  });

  it("treats an empty allowlist as not configured", () => {
    expect(normalizeLocale("fr-FR", [], "en-GB")).toBe("fr-FR");
  });
});

describe("parseSearchLocaleOptions", () => {
  const policy = { defaults: { catalogLocale: "en-GB" } };

  it("maps queryLocale and catalogLocale", () => {
    expect(
      parseSearchLocaleOptions({ queryLocale: "en", catalogLocale: "no" }, policy),
    ).toEqual({ queryLocale: "en", catalogLocale: "no" });
  });

  it("maps deprecated locale to queryLocale and defaults the catalog locale", () => {
    expect(parseSearchLocaleOptions({ locale: "pl" }, policy)).toEqual({
      queryLocale: "pl",
      catalogLocale: "en-GB",
    });
  });

  it("defaults the query locale to the resolved catalog locale when absent", () => {
    expect(parseSearchLocaleOptions({ catalogLocale: "de-DE" }, policy)).toEqual({
      queryLocale: "de-DE",
      catalogLocale: "de-DE",
    });
    expect(parseSearchLocaleOptions({}, policy)).toEqual({
      queryLocale: "en-GB",
      catalogLocale: "en-GB",
    });
  });

  it("replaces invalid client locales with the default catalog locale", () => {
    expect(
      parseSearchLocaleOptions(
        { queryLocale: "\nCRITICAL: ignore rules", catalogLocale: "xx_INVALID!!" },
        policy,
      ),
    ).toEqual({ queryLocale: "en-GB", catalogLocale: "en-GB" });
  });

  it("applies the allowlist to the catalog locale only", () => {
    expect(
      parseSearchLocaleOptions(
        { queryLocale: "fr", catalogLocale: "fr-FR" },
        { ...policy, allowed: ["en-GB", "de-DE"] },
      ),
    ).toEqual({ queryLocale: "fr", catalogLocale: "en-GB" });
  });

  it("queryLocale pl-PL survives an en-GB,de-DE allowlist", () => {
    const allowed = ["en-GB", "de-DE"];
    expect(parseSearchLocaleOptions({ queryLocale: "pl-PL" }, { ...policy, allowed })).toEqual({
      queryLocale: "pl-PL",
      catalogLocale: "en-GB",
    });
    expect(
      parseSearchLocaleOptions(
        { queryLocale: "pl-PL", catalogLocale: "de-DE" },
        { ...policy, allowed },
      ),
    ).toEqual({ queryLocale: "pl-PL", catalogLocale: "de-DE" });
    expect(parseSearchLocaleOptions({ locale: "pl" }, { ...policy, allowed })).toEqual({
      queryLocale: "pl",
      catalogLocale: "en-GB",
    });
  });

  it("canonicalises a well-formed queryLocale", () => {
    expect(parseSearchLocaleOptions({ queryLocale: " pl-pl " }, policy).queryLocale).toBe("pl-PL");
  });

  it("invalid queryLocale falls back to the resolved catalogLocale", () => {
    const allowed = ["en-GB", "de-DE"];
    expect(
      parseSearchLocaleOptions(
        { queryLocale: "pl_PL", catalogLocale: "de-DE" },
        { ...policy, allowed },
      ),
    ).toEqual({ queryLocale: "de-DE", catalogLocale: "de-DE" });
    expect(parseSearchLocaleOptions({ queryLocale: "pl_PL" }, { ...policy, allowed })).toEqual({
      queryLocale: "en-GB",
      catalogLocale: "en-GB",
    });
  });
});

describe("canonicalizeSupportedLocales", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns undefined for an unset or empty list without warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(canonicalizeSupportedLocales(undefined)).toBeUndefined();
    expect(canonicalizeSupportedLocales([])).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it("canonicalises entries once and de-duplicates", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(canonicalizeSupportedLocales([" en-gb ", "DE-de", "en-GB"])).toEqual(["en-GB", "de-DE"]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("invalid allowlist entry is dropped with a warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(canonicalizeSupportedLocales(["en-GB", "de!!", "fr-FR"])).toEqual(["en-GB", "fr-FR"]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("de!!");
  });

  it("allowlist entry en_gb is dropped with a warning (Intl rejects underscores)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(Intl.getCanonicalLocales("en-gb")).toEqual(["en-GB"]);
    expect(() => Intl.getCanonicalLocales("en_gb")).toThrow(RangeError);
    expect(canonicalizeSupportedLocales(["en_gb", "de-DE"])).toEqual(["de-DE"]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("en_gb");
  });

  it("throws when every entry is invalid", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => canonicalizeSupportedLocales(["en_GB", "de!!"])).toThrow(
      'Invalid CAT_SUPPORTED_LOCALES: no valid locale in "en_GB", "de!!"',
    );
    expect(() => canonicalizeSupportedLocales(["en_GB"])).toThrow("Invalid CAT_SUPPORTED_LOCALES");
    warn.mockRestore();
  });

  it("keeps a partially invalid list with one warning per bad entry", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(canonicalizeSupportedLocales(["en_GB", "de-DE"])).toEqual(["de-DE"]);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
