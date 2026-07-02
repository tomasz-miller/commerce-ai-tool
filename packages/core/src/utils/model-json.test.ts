import { describe, expect, it } from "vitest";
import {
  extractJsonObjectLiteral,
  parseModelJson,
  repairTruncatedJsonObject,
} from "./model-json.js";

describe("extractJsonObjectLiteral", () => {
  it("extracts JSON from markdown fences", () => {
    const raw = 'Here is the result:\n```json\n{"searchTerms":["shoes"]}\n```';
    expect(extractJsonObjectLiteral(raw)).toBe('{"searchTerms":["shoes"]}');
  });

  it("extracts the first balanced JSON object", () => {
    const raw = 'prefix {"transcript":"hello","searchTerms":["sko"]} suffix';
    expect(extractJsonObjectLiteral(raw)).toBe('{"transcript":"hello","searchTerms":["sko"]}');
  });
});

describe("repairTruncatedJsonObject", () => {
  it("closes an unterminated string and object", () => {
    const raw = '{"transcript":"szukam butów","interpretation":"użytkownik szuka';
    expect(repairTruncatedJsonObject(raw)).toBe(
      '{"transcript":"szukam butów","interpretation":"użytkownik szuka"}',
    );
  });
});

describe("parseModelJson", () => {
  it("parses fenced JSON payloads", () => {
    const result = parseModelJson<{ searchTerms: string[] }>(
      '```json\n{"searchTerms":["tapetkniv"]}\n```',
    );

    expect(result.searchTerms).toEqual(["tapetkniv"]);
  });

  it("repairs truncated JSON objects", () => {
    const result = parseModelJson<{ transcript: string; enhancedQuery: string }>(
      '{"transcript":"czerwone buty","enhancedQuery":"czerwone buty","searchTerms":["sko"],"interpretation":"Looking for',
    );

    expect(result.transcript).toBe("czerwone buty");
    expect(result.enhancedQuery).toBe("czerwone buty");
  });

  it("throws a clear error for invalid JSON", () => {
    expect(() => parseModelJson("not json at all")).toThrow("malformed JSON");
  });
});
