import { describe, expect, it } from "vitest";
import { isSuggestiblePhrase } from "./suggestion-quality.js";

describe("isSuggestiblePhrase", () => {
  it("accepts short product-name phrases", () => {
    expect(isSuggestiblePhrase("Chianti Wine Glass")).toBe(true);
    expect(isSuggestiblePhrase("Sparkle Champagne Glass")).toBe(true);
    expect(isSuggestiblePhrase("wooden table")).toBe(true);
  });

  it("rejects long truncated description sentences", () => {
    expect(
      isSuggestiblePhrase(
        "The Chianti Wine Glass is specifically designed to enhance the experience of",
      ),
    ).toBe(false);
    expect(
      isSuggestiblePhrase(
        "A tapered champagne glass, also known as a champagne flute, is a type of",
      ),
    ).toBe(false);
  });

  it("rejects phrases that exceed length or word caps", () => {
    expect(isSuggestiblePhrase("one two three four five six seven")).toBe(false);
    expect(isSuggestiblePhrase("x".repeat(51))).toBe(false);
  });
});
