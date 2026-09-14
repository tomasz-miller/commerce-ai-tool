import { describe, expect, it } from "vitest";
import { formatRecordingDuration } from "./recording-duration.js";

describe("formatRecordingDuration", () => {
  it("formats seconds as mm:ss", () => {
    expect(formatRecordingDuration(0)).toBe("0:00");
    expect(formatRecordingDuration(8)).toBe("0:08");
    expect(formatRecordingDuration(68)).toBe("1:08");
  });
});
