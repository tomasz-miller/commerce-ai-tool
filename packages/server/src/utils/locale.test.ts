import { describe, expect, it } from "vitest";
import { parseSearchLocaleOptions } from "./locale.js";

describe("parseSearchLocaleOptions", () => {
  it("maps queryLocale and catalogLocale", () => {
    expect(
      parseSearchLocaleOptions({ queryLocale: "en", catalogLocale: "no" }),
    ).toEqual({
      queryLocale: "en",
      catalogLocale: "no",
      locale: undefined,
    });
  });

  it("maps deprecated locale to queryLocale", () => {
    expect(parseSearchLocaleOptions({ locale: "en" })).toEqual({
      queryLocale: "en",
      catalogLocale: undefined,
      locale: "en",
    });
  });
});
