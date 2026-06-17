import { describe, expect, it } from "vitest";
import {
  buildTtsSummaryFallback,
  buildTtsSummaryUserMessage,
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
