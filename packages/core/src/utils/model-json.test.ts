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

  it("extracts JSON from fences without a language tag", () => {
    const raw = '```\n{"searchTerms":["boots"]}\n```';
    expect(extractJsonObjectLiteral(raw)).toBe('{"searchTerms":["boots"]}');
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

  it("fills a dangling colon before closing the object", () => {
    expect(repairTruncatedJsonObject('{\n  "transcript":')).toBe(
      '{\n  "transcript": null}',
    );
  });

  it("fills an empty value before an existing closing brace", () => {
    expect(repairTruncatedJsonObject('{\n  "transcript":}')).toBe(
      '{\n  "transcript": null}',
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

  it("repairs truncation right after a property colon", () => {
    const result = parseModelJson<{ transcript: string | null }>(
      '{\n  "transcript":',
    );

    expect(result.transcript).toBeNull();
  });

  it("throws a clear error for invalid JSON", () => {
    expect(() => parseModelJson("not json at all")).toThrow("malformed JSON");
  });
});
