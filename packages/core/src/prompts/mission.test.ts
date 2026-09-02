import { describe, expect, it } from "vitest";
import { MAX_LINE_ITEM_QUANTITY } from "../types/index.js";
import {
  MAX_MISSION_INTENTS,
  buildMissionQueryUserMessage,
  parseDecomposedMission,
} from "./index.js";

describe("parseDecomposedMission", () => {
  it("parses a compound mission with quantity defaults and ids", () => {
    const result = parseDecomposedMission(
      JSON.stringify({
        isMission: true,
        confidence: 0.9,
        intents: [
          { label: "tennis racket", searchTerms: ["tennis racket"] },
          { label: "golf balls", quantity: 2.8, searchTerms: ["golf balls"] },
          { label: "travel bag", quantity: 0, searchTerms: ["travel bag"] },
        ],
        interpretation: "three products",
      }),
    );

    expect(result.isMission).toBe(true);
    expect(result.confidence).toBe(0.9);
    expect(result.intents).toEqual([
      {
        id: "intent-0",
        label: "tennis racket",
        quantity: 1,
        searchTerms: ["tennis racket"],
      },
      {
        id: "intent-1",
        label: "golf balls",
        quantity: 2,
        searchTerms: ["golf balls"],
      },
      {
        id: "intent-2",
        label: "travel bag",
        quantity: 1,
        searchTerms: ["travel bag"],
      },
    ]);
  });

  it("returns no intents when isMission is false", () => {
    const result = parseDecomposedMission(
      JSON.stringify({
        isMission: false,
        confidence: 0.2,
        intents: [{ label: "shoes", searchTerms: ["red shoes"] }],
        interpretation: "single product",
      }),
    );

    expect(result.isMission).toBe(false);
    expect(result.intents).toEqual([]);
    expect(result.interpretation).toBe("single product");
  });

  it("caps intents and drops entries without searchTerms", () => {
    const intents = Array.from({ length: MAX_MISSION_INTENTS + 2 }, (_, index) => ({
      label: `item ${index}`,
      searchTerms: [`item ${index}`],
    }));
    intents.splice(1, 0, { label: "empty", searchTerms: [] });

    const result = parseDecomposedMission(
      JSON.stringify({
        isMission: true,
        confidence: 1.5,
        intents,
        interpretation: "many items",
      }),
    );

    expect(result.isMission).toBe(true);
    expect(result.confidence).toBe(1);
    expect(result.intents).toHaveLength(MAX_MISSION_INTENTS);
    expect(result.intents[0]?.label).toBe("item 0");
    expect(result.intents[1]?.label).toBe("item 1");
  });

  it("coerces string quantities and caps oversized values", () => {
    const result = parseDecomposedMission(
      JSON.stringify({
        isMission: true,
        confidence: 0.9,
        intents: [
          { label: "golf balls", quantity: "2", searchTerms: ["golf balls"] },
          { label: "travel bag", quantity: 99999, searchTerms: ["travel bag"] },
        ],
      }),
    );

    expect(result.intents[0]?.quantity).toBe(2);
    expect(result.intents[1]?.quantity).toBe(MAX_LINE_ITEM_QUANTITY);
  });

  it("treats a single remaining intent as not a mission", () => {
    const result = parseDecomposedMission(
      JSON.stringify({
        isMission: true,
        confidence: 0.8,
        intents: [{ label: "shoes", searchTerms: ["shoes"] }],
      }),
    );

    expect(result.isMission).toBe(false);
    expect(result.intents).toEqual([]);
  });

  it("throws on malformed JSON", () => {
    expect(() => parseDecomposedMission("not json")).toThrow();
  });
});

describe("buildMissionQueryUserMessage", () => {
  it("includes locale context and query text", () => {
    const message = buildMissionQueryUserMessage(
      "a racket and two balls",
      { queryLocale: "en", catalogLocale: "no" },
      [{ name: "color", label: "Color", kind: "distinct", attributeType: "enum", field: "color" }],
    );

    expect(message).toContain("Query: a racket and two balls");
    expect(message).toContain("catalog language: no");
    expect(message).toContain("Filterable attribute catalog");
  });
});
