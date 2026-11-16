import { describe, expect, it } from "vitest";
import { extractJsonObjectLiteral, parseModelJson } from "./model-json.js";

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

describe("parseModelJson", () => {
  it("parses fenced JSON payloads", () => {
    const result = parseModelJson<{ searchTerms: string[] }>(
      '```json\n{"searchTerms":["tapetkniv"]}\n```',
    );

    expect(result.searchTerms).toEqual(["tapetkniv"]);
  });

  it("rejects truncated JSON instead of repairing it", () => {
    expect(() =>
      parseModelJson(
        '{"transcript":"czerwone buty","enhancedQuery":"czerwone buty","searchTerms":["sko"],"interpretation":"Looking for',
      ),
    ).toThrow("malformed JSON");
  });

  it("rejects truncation right after a property colon", () => {
    expect(() => parseModelJson('{\n  "transcript":')).toThrow("malformed JSON");
  });

  it("still accepts complete JSON wrapped in prose", () => {
    expect(
      parseModelJson<{ searchTerms: string[] }>('Sure: {"searchTerms":["boots"]} hope that helps'),
    ).toEqual({ searchTerms: ["boots"] });
  });

  it("throws a clear error for invalid JSON", () => {
    expect(() => parseModelJson("not json at all")).toThrow("malformed JSON");
  });
});
