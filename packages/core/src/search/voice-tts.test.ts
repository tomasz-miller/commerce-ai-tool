import { describe, expect, it } from "vitest";
import {
  buildTtsSummaryFallback,
  buildTtsSummaryUserMessage,
  MAX_TTS_CHARS,
  truncateTtsText,
} from "./voice-tts.js";

describe("buildTtsSummaryUserMessage", () => {
  it("includes query locale and result count", () => {
    const message = buildTtsSummaryUserMessage(3, "Tapetkniv", {
      queryLocale: "pl",
      catalogLocale: "no",
    });

    expect(message).toContain("User query language: pl");
    expect(message).toContain("Number of results: 3");
    expect(message).toContain("Tapetkniv");
    expect(message).toContain("Write the summary in pl only");
  });
});

describe("buildTtsSummaryFallback", () => {
  it("returns Polish messages", () => {
    expect(buildTtsSummaryFallback(0, undefined, "pl")).toContain("Nie znaleziono");
    expect(buildTtsSummaryFallback(1, "Nóż", "pl")).toContain("Znaleziono 1 produkt");
    expect(buildTtsSummaryFallback(5, "Nóż", "pl")).toContain("Znaleziono 5 produktów");
  });

  it("returns English messages by default", () => {
    expect(buildTtsSummaryFallback(2, undefined, "fr")).toContain("Found 2 products");
  });
});

describe("truncateTtsText", () => {
  it("caps at MAX_TTS_CHARS = 500", () => {
    expect(MAX_TTS_CHARS).toBe(500);
  });

  it("leaves short text unchanged (trimmed)", () => {
    expect(truncateTtsText("  Found 3 glasses.  ")).toBe("Found 3 glasses.");
  });

  it("cuts a 900-char summary at the last sentence boundary within the cap", () => {
    const sentence = "Found many wine glasses in the catalog for you today. "; // 54 chars
    const text = sentence.repeat(17).trim(); // ~917 chars
    expect(text.length).toBeGreaterThan(900);

    const truncated = truncateTtsText(text);

    expect(truncated.length).toBeLessThanOrEqual(MAX_TTS_CHARS);
    expect(truncated.endsWith("today.")).toBe(true);
    expect(text.startsWith(truncated)).toBe(true);
  });

  it("falls back to the last word boundary when no sentence ends within the cap", () => {
    const text = Array.from({ length: 150 }, (_, i) => `word${i}`).join(" "); // ~900 chars
    expect(text.length).toBeGreaterThan(900);

    const truncated = truncateTtsText(text);

    expect(truncated.length).toBeLessThanOrEqual(MAX_TTS_CHARS);
    expect(text.startsWith(truncated)).toBe(true);
    expect(text.charAt(truncated.length)).toBe(" ");
    expect(truncated.endsWith(" ")).toBe(false);
  });

  it("hard-cuts a single unbroken token", () => {
    expect(truncateTtsText("x".repeat(900))).toHaveLength(MAX_TTS_CHARS);
  });

  it("never ends a hard cut on a lone high surrogate", () => {
    const text = `${"x".repeat(499)}😀${"x".repeat(99)}`; // emoji occupies indices 499-500
    expect(text).toHaveLength(600);

    const truncated = truncateTtsText(text);

    expect(truncated).toHaveLength(499);
    const last = truncated.charCodeAt(truncated.length - 1);
    expect(last >= 0xd800 && last <= 0xdbff).toBe(false);
  });
});
