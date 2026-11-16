import { afterEach, describe, expect, it, vi } from "vitest";
import { audioFromBase64, createAudioPlayer, recordedAudioFile } from "./audio.js";

describe("recordedAudioFile", () => {
  it("audio/mp4 blob becomes recording.m4a", () => {
    const file = recordedAudioFile(new Blob(["x"], { type: "audio/mp4" }), "audio/mp4");

    expect(file.name).toBe("recording.m4a");
    expect(file.type).toBe("audio/mp4");
  });

  it("derives the extension from the recorder container, parameters included", () => {
    expect(recordedAudioFile(new Blob(["x"]), "audio/webm;codecs=opus").name).toBe("recording.webm");
    expect(recordedAudioFile(new Blob(["x"]), "audio/ogg;codecs=opus").name).toBe("recording.ogg");
    expect(recordedAudioFile(new Blob(["x"]), "audio/wav").name).toBe("recording.wav");
  });

  it("keeps the recorder MIME type (parameters included) as the part type", () => {
    expect(recordedAudioFile(new Blob(["x"]), "audio/webm;codecs=opus").type).toBe(
      "audio/webm;codecs=opus",
    );
  });

  it("falls back to audio/webm for an empty or unsupported type", () => {
    for (const mimeType of ["", "video/webm", "application/octet-stream"]) {
      const file = recordedAudioFile(new Blob(["x"]), mimeType);
      expect(file.name).toBe("recording.webm");
      expect(file.type).toBe("audio/webm");
    }
  });

  it("keeps the recorded bytes", async () => {
    const file = recordedAudioFile(new Blob(["abc"]), "audio/webm");
    expect(await file.text()).toBe("abc");
  });
});

describe("createAudioPlayer", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function setup() {
    const elements: Array<{ src: string; play: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn> }> = [];
    const createObjectURL = vi.fn(() => `blob:clip-${createObjectURL.mock.calls.length}`);
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    const player = createAudioPlayer(() => {
      const element = { src: "", play: vi.fn(() => Promise.resolve()), pause: vi.fn() };
      elements.push(element);
      return element as unknown as HTMLAudioElement;
    });
    return { player, elements, createObjectURL, revokeObjectURL };
  }

  it("plays a blob through an object URL and reuses one element", async () => {
    const { player, elements, createObjectURL } = setup();

    await player.play(new Blob(["a"], { type: "audio/mpeg" }));
    await player.play(new Blob(["b"], { type: "audio/mpeg" }));

    expect(createObjectURL).toHaveBeenCalledTimes(2);
    expect(elements).toHaveLength(1);
    expect(elements[0]!.pause).toHaveBeenCalledTimes(2);
    expect(elements[0]!.play).toHaveBeenCalledTimes(2);
  });

  it("revokes the previous URL when a new clip replaces it", async () => {
    const { player, revokeObjectURL } = setup();

    await player.play(new Blob(["a"]));
    await player.play(new Blob(["b"]));

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:clip-1");
  });

  it("stop pauses and revokes, and dispose is safe to repeat", async () => {
    const { player, elements, revokeObjectURL } = setup();

    await player.play(new Blob(["a"]));
    player.stop();
    player.dispose();
    player.dispose();

    expect(elements[0]!.pause).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it("does not throw when playback is rejected (autoplay policy)", async () => {
    const { player, elements } = setup();
    await player.play(new Blob(["a"]));
    elements[0]!.play.mockRejectedValueOnce(new DOMException("blocked", "NotAllowedError"));

    await expect(player.play(new Blob(["b"]))).resolves.toBeUndefined();
  });
});

describe("audioFromBase64", () => {
  it("decodes the inline summary into an audio/mpeg blob", async () => {
    const clip = audioFromBase64(btoa("abc"));

    expect(clip.type).toBe("audio/mpeg");
    expect(await clip.text()).toBe("abc");
  });
});
