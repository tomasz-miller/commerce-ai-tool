import { describe, expect, it } from "vitest";
import {
  DEFAULT_MISSION_MIN_CONFIDENCE,
  isUsableMission,
  looksLikeCompoundShoppingList,
  resolveMissionOptions,
} from "./mission.js";

describe("isUsableMission", () => {
  it("requires isMission, min confidence, and at least two intents", () => {
    expect(
      isUsableMission(
        {
          isMission: true,
          confidence: 0.9,
          intents: [
            { id: "intent-0", label: "a", quantity: 1, searchTerms: ["a"] },
            { id: "intent-1", label: "b", quantity: 1, searchTerms: ["b"] },
          ],
          interpretation: "two items",
        },
        0.6,
      ),
    ).toBe(true);

    expect(
      isUsableMission(
        {
          isMission: true,
          confidence: 0.4,
          intents: [
            { id: "intent-0", label: "a", quantity: 1, searchTerms: ["a"] },
            { id: "intent-1", label: "b", quantity: 1, searchTerms: ["b"] },
          ],
          interpretation: "low",
        },
        0.6,
      ),
    ).toBe(false);

    expect(isUsableMission(null, 0.6)).toBe(false);
  });
});

describe("looksLikeCompoundShoppingList", () => {
  it("detects list separators used in typed and spoken queries", () => {
    expect(looksLikeCompoundShoppingList("taller glasses")).toBe(false);
    expect(looksLikeCompoundShoppingList("glasses and a coffee table")).toBe(true);
    expect(looksLikeCompoundShoppingList("glasses, chairs")).toBe(true);
    expect(looksLikeCompoundShoppingList("racket plus balls")).toBe(true);
    expect(looksLikeCompoundShoppingList("szklanki oraz stolik")).toBe(true);
  });
});

describe("resolveMissionOptions", () => {
  it("is opt-in and clamps configured bounds", () => {
    expect(resolveMissionOptions(undefined)).toEqual({
      enabled: false,
      maxIntents: 5,
      perIntentLimit: 4,
      minConfidence: DEFAULT_MISSION_MIN_CONFIDENCE,
    });

    expect(
      resolveMissionOptions({ enabled: true, maxIntents: 99, perIntentLimit: 0, minConfidence: 2 }, false),
    ).toEqual({
      enabled: false,
      maxIntents: 5,
      perIntentLimit: 1,
      minConfidence: 1,
    });
  });
});
