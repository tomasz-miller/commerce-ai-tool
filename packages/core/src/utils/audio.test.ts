import { describe, expect, it } from "vitest";
import {
  mimeTypeToAudioFormat,
  SUPPORTED_AUDIO_MIME_TYPES,
  UnsupportedAudioTypeError,
  uint8ArrayToBase64,
} from "./audio.js";

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

describe("UnsupportedAudioTypeError", () => {
  it("is thrown for an unknown MIME type and keeps the MIME type for logging", () => {
    expect(() => mimeTypeToAudioFormat("audio/unknown")).toThrow(UnsupportedAudioTypeError);
    try {
      mimeTypeToAudioFormat("audio/unknown");
    } catch (error) {
      expect((error as UnsupportedAudioTypeError).mimeType).toBe("audio/unknown");
    }
  });
});

describe("SUPPORTED_AUDIO_MIME_TYPES", () => {
  it("lists every MIME type mimeTypeToAudioFormat accepts", () => {
    expect(SUPPORTED_AUDIO_MIME_TYPES).toContain("audio/mp4");
    expect(SUPPORTED_AUDIO_MIME_TYPES).toContain("audio/webm");
    for (const mimeType of SUPPORTED_AUDIO_MIME_TYPES) {
      expect(() => mimeTypeToAudioFormat(mimeType)).not.toThrow();
    }
  });
});

describe("uint8ArrayToBase64", () => {
  it("encodes bytes to base64", () => {
    const encoded = uint8ArrayToBase64(new Uint8Array([72, 101, 108, 108, 111]));
    expect(encoded).toBe("SGVsbG8=");
  });
});
