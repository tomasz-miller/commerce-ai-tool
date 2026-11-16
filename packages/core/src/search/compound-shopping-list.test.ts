import { describe, expect, it } from "vitest";
import { looksLikeCompoundShoppingList, looksLikeShoppingList } from "./compound-shopping-list.js";

describe("looksLikeShoppingList", () => {
  it.each([
    ["a tennis racket and two golf balls", "en"],
    ["glasses plus a coffee table", "en-GB"],
    ["shoes & socks", "en"],
    ["ein Tennisschläger und zwei Golfbälle", "de-DE"],
    ["Gläser sowie ein Couchtisch", "de"],
    ["rakieta tenisowa i dwie piłki golfowe", "pl"],
    ["kieliszki oraz stolik kawowy", "pl-PL"],
    ["une raquette et deux balles", "fr"],
    ["una raqueta y dos pelotas", "es"],
    ["una raqueta e hilo", "es"],
    ["una racchetta e due palline", "it"],
    ["een racket en twee ballen", "nl"],
    ["glass, table", "de"],
    ["glasses\ncoffee table", "en"],
    ["- glasses\n- coffee table", "en"],
    ["• glasses • coffee table", "en"],
    ["1. glasses 2. coffee table", "en"],
    ["glasses; coffee table", "fr"],
    ["glasses and coffee table", "de"],
  ])("detects a list in %j (%s)", (query, locale) => {
    expect(looksLikeShoppingList(query, locale)).toBe(true);
  });

  it.each([
    ["red shoes", "en"],
    ["coffee table", "en-GB"],
    ["rote Schuhe", "de"],
    ["czerwone buty", "pl"],
    ["chaussures rouges", "fr"],
    ["zapatos rojos", "es"],
    ["scarpe rosse", "it"],
    ["rode schoenen", "nl"],
    ["Sandsack 1,5", "de"],
    ["candle", "en"],
    ["", "en"],
    ["   ", "en"],
  ])("does not flag a single product %j (%s)", (query, locale) => {
    expect(looksLikeShoppingList(query, locale)).toBe(false);
  });

  it("does not apply another language's one-letter conjunction", () => {
    expect(looksLikeShoppingList("chaise e", "en")).toBe(false);
    expect(looksLikeShoppingList("i skarpetki", "en")).toBe(false);
  });

  it("three bare words pass the gate", () => {
    expect(looksLikeShoppingList("milk eggs bread", "en")).toBe(true);
    expect(looksLikeShoppingList("Milch Eier Brot", "de")).toBe(true);
  });

  it("two bare words do not", () => {
    expect(looksLikeShoppingList("milk eggs", "en")).toBe(false);
  });

  it("a single product phrase of one or two words does not", () => {
    expect(looksLikeShoppingList("sneakers", "en")).toBe(false);
    expect(looksLikeShoppingList("  wine   glass ", "en")).toBe(false);
    expect(looksLikeShoppingList("tapetkniv", "en")).toBe(false);
  });

  it("matches conjunctions as whole words only", () => {
    expect(looksLikeShoppingList("sandals", "en")).toBe(false);
    expect(looksLikeShoppingList("Bundeswehr Rucksack", "de")).toBe(false);
  });

  it("keeps the mission call for a language without a conjunction list", () => {
    expect(looksLikeShoppingList("røde sko", "no")).toBe(true);
    expect(looksLikeShoppingList("红色的鞋", "zh")).toBe(true);
  });
});

describe("looksLikeCompoundShoppingList", () => {
  it("keeps its widget behaviour", () => {
    expect(looksLikeCompoundShoppingList("glasses and chairs")).toBe(true);
    expect(looksLikeCompoundShoppingList("taller glasses")).toBe(false);
  });
});
