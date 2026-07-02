const MIME_TO_AUDIO_FORMAT: Record<string, string> = {
  "audio/wav": "wav",
  "audio/wave": "wav",
  "audio/x-wav": "wav",
  "audio/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/m4a": "m4a",
  "audio/ogg": "ogg",
  "audio/flac": "flac",
  "audio/aac": "aac",
};

/** Maps a MIME type to an OpenRouter `input_audio.format` value. */
export function mimeTypeToAudioFormat(mimeType: string): string {
  const normalized = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  const format = MIME_TO_AUDIO_FORMAT[normalized];
  if (!format) {
    throw new Error(`Unsupported audio MIME type for voice search: ${mimeType}`);
  }
  return format;
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }

  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }

  return btoa(binary);
}
