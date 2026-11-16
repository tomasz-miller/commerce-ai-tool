import { describe, expect, it } from "vitest";
import { defaultLangfuseMask, redactPii } from "./mask.js";
import * as flushEntry from "../flush.js";
import * as mainEntry from "../index.js";

const mask = (data: unknown): unknown => defaultLangfuseMask({ data });

describe("defaultLangfuseMask", () => {
  it("mask redacts emails and phone numbers", () => {
    expect(mask("send it to shopper@example.test please")).toBe(
      "send it to [redacted-email] please",
    );
    expect(mask("call +48 000 000 000 today")).toBe("call [redacted-phone] today");
    expect(mask("call 000-0000-000 or 0000000")).toBe("call [redacted-phone] or [redacted-phone]");
    expect(mask("shopper@example.test and shopper.two+tag@mail.example.test")).toBe(
      "[redacted-email] and [redacted-email]",
    );
  });

  it("redacts strings recursively inside objects and arrays", () => {
    expect(
      mask({
        text: "mail shopper@example.test",
        nested: { list: ["+48 000 000 000", { deep: "ok shopper@example.test" }] },
      }),
    ).toEqual({
      text: "mail [redacted-email]",
      nested: { list: ["[redacted-phone]", { deep: "ok [redacted-email]" }] },
    });
  });

  it("leaves non-string values and short numbers alone", () => {
    const date = new Date(0);
    expect(mask(42)).toBe(42);
    expect(mask(true)).toBe(true);
    expect(mask(null)).toBeNull();
    expect(mask(undefined)).toBeUndefined();
    expect(mask({ count: 3, ok: false, when: date })).toEqual({ count: 3, ok: false, when: date });
    expect(mask("size 42, 1234 items, 123456 digits")).toBe("size 42, 1234 items, 123456 digits");
  });

  it("does not mutate its input", () => {
    const input = { text: "shopper@example.test", list: ["+48 000 000 000"] };
    mask(input);
    expect(input).toEqual({ text: "shopper@example.test", list: ["+48 000 000 000"] });
  });

  it("does not touch digit runs inside identifiers such as trace ids", () => {
    const traceId = "ab1234567890cdef1234567890abcdef";
    expect(mask(traceId)).toBe(traceId);
  });

  it("masks a JSON-string input and keeps it valid JSON with numbers intact", () => {
    // @langfuse/otel passes observation input and output to the mask as JSON strings.
    const input = JSON.stringify({
      image: { mimeType: "image/jpeg", byteLength: 2345678, hash: "1234567abcdef" },
      query: "call +48 000 000 000 or shopper@example.test",
    });

    const masked = mask(input);

    expect(typeof masked).toBe("string");
    const parsed = JSON.parse(masked as string) as {
      image: { mimeType: string; byteLength: number; hash: string };
      query: string;
    };
    expect(parsed.image.byteLength).toBe(2345678);
    expect(parsed.image.hash).toBe("1234567abcdef");
    expect(parsed.image.mimeType).toBe("image/jpeg");
    expect(parsed.query).toBe("call [redacted-phone] or [redacted-email]");
  });

  it("masks JSON-string arrays and falls back to string redaction for other strings", () => {
    expect(mask(JSON.stringify(["+48 000 000 000", 5]))).toBe(
      JSON.stringify(["[redacted-phone]", 5]),
    );
    expect(mask("{not json shopper@example.test")).toBe("{not json [redacted-email]");
    expect(mask("[1, 2")).toBe("[1, 2");
    expect(mask("123")).toBe("123");
  });

  it("redacts an email used as an object key inside a JSON-string input", () => {
    const masked = mask(JSON.stringify({ "shopper@example.test": { count: 2 }, plain: "ok" }));

    expect(masked).not.toContain("shopper@example.test");
    expect(JSON.parse(masked as string)).toEqual({ "[redacted-email]": { count: 2 }, plain: "ok" });
  });

  it("redacts email keys of plain objects too", () => {
    expect(mask({ "shopper@example.test": "x" })).toEqual({ "[redacted-email]": "x" });
  });

  it("keeps numeric values such as byteLength and centAmount", () => {
    const input = { byteLength: 2345678, centAmount: 12345678901, nested: [{ n: 1234567890 }] };

    expect(mask(input)).toEqual(input);
    expect(JSON.parse(mask(JSON.stringify(input)) as string)).toEqual(input);
  });

  it("two keys that redact to the same value are both kept", () => {
    const masked = mask({
      "a@example.test": 1,
      "b@example.test": 2,
      "c@example.test": 3,
    }) as Record<string, number>;

    expect(Object.values(masked).sort()).toEqual([1, 2, 3]);
    expect(Object.keys(masked)).toEqual(["[redacted-email]", "[redacted-email]#2", "[redacted-email]#3"]);
    expect(JSON.stringify(masked)).not.toContain("example.test");
  });

  it("suffixes many colliding keys in linear time and keeps every value", () => {
    const count = 20_000;
    const input: Record<string, number> = {};
    for (let i = 0; i < count; i += 1) {
      input[`user${i}@example.test`] = i;
    }

    const started = performance.now();
    const masked = mask(input) as Record<string, number>;
    const elapsedMs = performance.now() - started;

    expect(Object.keys(masked)).toHaveLength(count);
    expect(new Set(Object.values(masked)).size).toBe(count);
    // Probing from `#2` on every key would take seconds (about 2e8 lookups); linear takes tens of ms.
    expect(elapsedMs).toBeLessThan(1500);
  });

  it("does not overwrite a key that already looks like a generated suffix", () => {
    const masked = mask({
      "a@example.test": 1,
      "[redacted-email]#2": 2,
      "b@example.test": 3,
      "c@example.test": 4,
    }) as Record<string, number>;

    expect(Object.values(masked).sort()).toEqual([1, 2, 3, 4]);
    expect(Object.keys(masked)).toHaveLength(4);
  });

  it("does not redact hex hashes or model ids", () => {
    const sha = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
    const survivors = [
      sha,
      "1234567abcdef",
      "abcdef1234567",
      "gpt-4o-2024-08-06",
      "claude-3-5-sonnet-20241022",
      "google/gemini-2.5-flash-20250617",
      "0000000a",
      "ab1234567890cdef1234567890abcdef",
    ];
    for (const value of survivors) {
      expect(mask(value)).toBe(value);
      expect(mask(`model ${value} used`)).toBe(`model ${value} used`);
    }
  });

  it("still redacts real phone numbers next to punctuation and words", () => {
    expect(mask("000-000-0000")).toBe("[redacted-phone]");
    expect(mask("+48 000 000 000")).toBe("[redacted-phone]");
    expect(mask("(call 000 000 000)")).toBe("(call [redacted-phone])");
    expect(mask("tel: 0000000, thanks")).toBe("tel: [redacted-phone], thanks");
    expect(mask("phone\n+48000000000")).toBe("phone\n[redacted-phone]");
  });

  it("stays linear on long adversarial input", () => {
    const inputs = [
      "a".repeat(200_000),
      `${"a.".repeat(100_000)}@`,
      "1 ".repeat(100_000),
      `${"1-".repeat(100_000)}x`,
      "@".repeat(100_000),
      `${"1".repeat(100_000)}a`,
      `${"1a".repeat(100_000)}`,
      `${"1 a-".repeat(50_000)}`,
      JSON.stringify({ text: "1 ".repeat(50_000), list: Array.from({ length: 1000 }, () => "a@b.c") }),
    ];
    const start = performance.now();
    for (const input of inputs) {
      mask(input);
    }
    expect(performance.now() - start).toBeLessThan(2_000);
  });

  it("fails closed on cyclic structures instead of throwing", () => {
    const cyclic: Record<string, unknown> = { text: "shopper@example.test" };
    cyclic.self = cyclic;
    const result = mask(cyclic) as Record<string, unknown>;
    expect(result.text).toBe("[redacted-email]");
    expect(JSON.stringify(result)).not.toContain("shopper@example.test");
  });

  it("matches the installed MaskFunction signature and is exported from the package entries", () => {
    expect(mainEntry.defaultLangfuseMask).toBe(defaultLangfuseMask);
    expect(flushEntry.defaultLangfuseMask).toBe(defaultLangfuseMask);
  });
});

describe("redactPii", () => {
  it("redacts emails and phone numbers in plain text", () => {
    expect(redactPii("shopper@example.test +48 000 000 000")).toBe(
      "[redacted-email] [redacted-phone]",
    );
  });
});
