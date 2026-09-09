import { describe, expect, it } from "vitest";
import { isJsonSchemaUnsupportedMessage } from "./json-schema-errors.js";

describe("isJsonSchemaUnsupportedMessage", () => {
  it("matches json_schema rejections", () => {
    expect(isJsonSchemaUnsupportedMessage("This model does not support json_schema")).toBe(true);
    expect(
      isJsonSchemaUnsupportedMessage("Invalid response_format: json_schema is not supported"),
    ).toBe(true);
  });

  it("matches unsupported response_format without requiring the json_schema token", () => {
    expect(
      isJsonSchemaUnsupportedMessage("response_format type is unsupported for this model"),
    ).toBe(true);
  });

  it("does not treat unrelated response_format errors as schema fallback", () => {
    expect(isJsonSchemaUnsupportedMessage("Invalid response_format payload")).toBe(false);
    expect(isJsonSchemaUnsupportedMessage("temperature must be between 0 and 2")).toBe(false);
  });
});
