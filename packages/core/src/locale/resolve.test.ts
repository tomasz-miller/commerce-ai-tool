import { describe, expect, it } from "vitest";
import { resolveSearchLocales } from "./resolve.js";

describe("resolveSearchLocales", () => {
  it("uses catalogLocale from defaults", () => {
    expect(resolveSearchLocales({ defaults: { catalogLocale: "no" } })).toEqual({
      catalogLocale: "no",
      queryLocale: "no",
    });
  });

  it("falls back deprecated locale in defaults to catalogLocale", () => {
    expect(resolveSearchLocales({ defaults: { locale: "de" } })).toEqual({
      catalogLocale: "de",
      queryLocale: "de",
    });
  });

  it("prefers request catalogLocale over defaults", () => {
    expect(
      resolveSearchLocales({
        defaults: { catalogLocale: "no" },
        request: { catalogLocale: "sv" },
      }),
    ).toEqual({
      catalogLocale: "sv",
      queryLocale: "sv",
    });
  });

  it("allows queryLocale different from catalogLocale", () => {
    expect(
      resolveSearchLocales({
        defaults: { catalogLocale: "no" },
        request: { queryLocale: "en" },
      }),
    ).toEqual({
      catalogLocale: "no",
      queryLocale: "en",
    });
  });

  it("maps deprecated request locale to queryLocale", () => {
    expect(
      resolveSearchLocales({
        defaults: { catalogLocale: "no" },
        request: { locale: "en" },
      }),
    ).toEqual({
      catalogLocale: "no",
      queryLocale: "en",
    });
  });

  it("defaults to en when nothing is configured", () => {
    expect(resolveSearchLocales({})).toEqual({
      catalogLocale: "en",
      queryLocale: "en",
    });
  });
});
