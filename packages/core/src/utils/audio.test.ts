import { describe, expect, it } from "vitest";
import { mimeTypeToAudioFormat, uint8ArrayToBase64 } from "./audio.js";

describe("mimeTypeToAudioFormat", () => {
  it("maps common audio MIME types", () => {
    expect(mimeTypeToAudioFormat("audio/wav")).toBe("wav");
    expect(mimeTypeToAudioFormat("audio/webm")).toBe("webm");
    expect(mimeTypeToAudioFormat("audio/mpeg")).toBe("mp3");
    expect(mimeTypeToAudioFormat("audio/wav; codecs=1")).toBe("wav");
  });

  it("throws for unsupported MIME types", () => {
    expect(() => mimeTypeToAudioFormat("audio/unknown")).toThrow(
      "Unsupported audio MIME type for voice search",
    );
  });
});

describe("uint8ArrayToBase64", () => {
  it("encodes bytes to base64", () => {
    const encoded = uint8ArrayToBase64(new Uint8Array([72, 101, 108, 108, 111]));
    expect(encoded).toBe("SGVsbG8=");
  });
});
