import { mimeTypeToAudioFormat } from "../utils/audio.js";

const FALLBACK_AUDIO_TYPE = "audio/webm";

/**
 * Wraps a `MediaRecorder` result as an upload part named after the container the browser really
 * recorded. Pass `recorder.mimeType`: it is the type the browser chose (for example `audio/mp4`
 * on Safari, `audio/webm;codecs=opus` on Chrome), which a hard-coded label would misreport to
 * speech-to-text. An empty or unsupported type falls back to `audio/webm`.
 */
export function recordedAudioFile(blob: Blob, mimeType: string): File {
  let type = mimeType.trim();
  let extension: string;
  try {
    extension = mimeTypeToAudioFormat(type);
  } catch {
    type = FALLBACK_AUDIO_TYPE;
    extension = "webm";
  }
  return new File([blob], `recording.${extension}`, { type });
}

/** Decodes the inline base64 `audioSummary` of a voice search response into a playable clip. */
export function audioFromBase64(base64: string, type = "audio/mpeg"): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type });
}

export interface AudioPlayer {
  /** Replaces whatever is playing. Resolves when playback started or was refused by the browser. */
  play(blob: Blob): Promise<void>;
  stop(): void;
  /** Stops playback and releases the object URL. Safe to call repeatedly. */
  dispose(): void;
}

/**
 * Plays blobs (for example `/tts` audio) through one `HTMLAudioElement`: a new clip pauses the
 * previous one, so clips never overlap, and each object URL is revoked once replaced or stopped.
 * Replaces the base64 round-trip and per-clip `new Audio(dataUrl)`.
 */
export function createAudioPlayer(
  createElement: () => HTMLAudioElement = () => new Audio(),
): AudioPlayer {
  let element: HTMLAudioElement | null = null;
  let objectUrl: string | null = null;

  const releaseUrl = (): void => {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
  };

  const stop = (): void => {
    element?.pause();
    releaseUrl();
  };

  return {
    async play(blob) {
      element ??= createElement();
      element.pause();
      releaseUrl();
      objectUrl = URL.createObjectURL(blob);
      element.src = objectUrl;
      try {
        await element.play();
      } catch {
        // Autoplay policy or a decode error: the caller still has the replay button.
      }
    },
    stop,
    dispose: stop,
  };
}
