import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_COMMERCE_AI_SEARCH_MESSAGES } from "@commerce-ai-tool/core/client";
import { useCommerceAISearch } from "./useCommerceAISearch.js";
import { useVoiceSearch } from "./useVoiceSearch.js";

class FakeMediaRecorder {
  static mimeType = "audio/mp4";
  static instances: FakeMediaRecorder[] = [];
  mimeType = FakeMediaRecorder.mimeType;
  state: "inactive" | "recording" = "inactive";
  stopCalls = 0;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void | Promise<void>) | null = null;

  constructor() {
    FakeMediaRecorder.instances.push(this);
  }

  start() {
    this.state = "recording";
  }

  stop() {
    this.stopCalls += 1;
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["voice"], { type: this.mimeType }) });
    void this.onstop?.();
  }
}

describe("useVoiceSearch", () => {
  const getUserMedia = vi.fn();

  beforeEach(() => {
    FakeMediaRecorder.instances = [];
    FakeMediaRecorder.mimeType = "audio/mp4";
    getUserMedia.mockReset();
    getUserMedia.mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] });
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("uploads the recording named and typed after the container the browser chose", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        transcript: "red shoes",
        products: [],
        meta: {},
        ttsPending: false,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const onTranscript = vi.fn();

    const { result } = renderHook(() =>
      useVoiceSearch({ apiBaseUrl: "/api/commerce-ai/", onTranscript, enableTts: false }),
    );

    await act(async () => {
      await result.current.toggleRecording();
    });
    await act(async () => {
      await result.current.toggleRecording();
    });

    await waitFor(() => expect(onTranscript).toHaveBeenCalledWith("red shoes"));
    const [url, init] = fetchMock.mock.calls[0] as [string, { body: FormData }];
    expect(url).toBe("/api/commerce-ai/search/voice");
    const audio = init.body.get("audio") as File;
    expect(audio.name).toBe("recording.m4a");
    expect(audio.type).toBe("audio/mp4");
    expect(init.body.get("enableTts")).toBe("false");
  });

  it("shows the localized microphone message when permission is denied", async () => {
    getUserMedia.mockRejectedValue(new DOMException("denied", "NotAllowedError"));

    const { result } = renderHook(() =>
      useVoiceSearch({
        apiBaseUrl: "/api/commerce-ai",
        messages: { microphoneDenied: "Mikrofon blockiert" },
      }),
    );

    await act(async () => {
      await result.current.toggleRecording();
    });

    expect(result.current.error).toBe("Mikrofon blockiert");
  });

  it("falls back to the microphone-unavailable message when there is no microphone", async () => {
    getUserMedia.mockRejectedValue(new DOMException("none", "NotFoundError"));

    const { result } = renderHook(() => useVoiceSearch({ apiBaseUrl: "/api/commerce-ai" }));

    await act(async () => {
      await result.current.toggleRecording();
    });

    expect(result.current.error).toBe(DEFAULT_COMMERCE_AI_SEARCH_MESSAGES.microphoneUnavailable);
  });

  it("plays the TTS clip through one player and releases it on unmount", async () => {
    const createObjectURL = vi.fn(() => "blob:tts");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL }));
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith("/tts")
        ? { ok: true, blob: async () => new Blob(["mp3"], { type: "audio/mpeg" }) }
        : {
            ok: true,
            json: async () => ({
              transcript: "red shoes",
              products: [],
              meta: {},
              ttsText: "Found shoes",
              ttsPending: true,
            }),
          },
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result, unmount } = renderHook(() => useVoiceSearch({ apiBaseUrl: "/api/commerce-ai" }));

    await act(async () => {
      await result.current.toggleRecording();
    });
    await act(async () => {
      await result.current.toggleRecording();
    });

    await waitFor(() => expect(result.current.audioClip).toBeInstanceOf(Blob));
    expect(play).toHaveBeenCalledTimes(1);
    expect(result.current).not.toHaveProperty("audioSummary");

    act(() => result.current.replayAudioSummary());
    expect(play).toHaveBeenCalledTimes(2);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);

    unmount();
    expect(pause).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
  });

  it("turns the inline server audioSummary into a replayable clip", async () => {
    const createObjectURL = vi.fn(() => "blob:inline");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          transcript: "red shoes",
          products: [],
          meta: {},
          audioSummary: btoa("inline-mp3"),
          ttsPending: false,
        }),
      }),
    );

    const { result } = renderHook(() => useVoiceSearch({ apiBaseUrl: "/api/commerce-ai" }));

    await act(async () => {
      await result.current.toggleRecording();
    });
    await act(async () => {
      await result.current.toggleRecording();
    });

    await waitFor(() => expect(result.current.audioClip).toBeInstanceOf(Blob));
    expect(play).toHaveBeenCalledTimes(1);

    act(() => result.current.clearAudioSummary());
    expect(result.current.audioClip).toBeNull();
  });

  /**
   * A fetch whose responses the test releases by hand. Like the real one it rejects with an
   * AbortError as soon as its signal aborts (`rejectOnAbort: false` keeps it pending).
   */
  function stubManualFetch({ rejectOnAbort = true }: { rejectOnAbort?: boolean } = {}) {
    const pending: {
      url: string;
      init: { body?: unknown; signal?: AbortSignal };
      resolve: (value: unknown) => void;
    }[] = [];
    const fetchMock = vi.fn(
      (url: string, init: { body?: unknown; signal?: AbortSignal }) =>
        new Promise((resolve, reject) => {
          pending.push({ url, init, resolve });
          if (rejectOnAbort) {
            init.signal?.addEventListener("abort", () =>
              reject(new DOMException("The operation was aborted.", "AbortError")),
            );
          }
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const next = (suffix: string) => {
      const found = pending.find((entry) => entry.url.endsWith(suffix));
      if (!found) throw new Error(`no pending ${suffix}`);
      pending.splice(pending.indexOf(found), 1);
      return found;
    };
    return { fetchMock, next };
  }

  const ok = (body: unknown) => ({ ok: true, json: async () => body });
  const searchMeta = { total: 1, limit: 20, offset: 0, queryInterpretation: "q" };

  async function record(result: { current: ReturnType<typeof useVoiceSearch> }) {
    await act(async () => {
      await result.current.toggleRecording();
    });
    await act(async () => {
      await result.current.toggleRecording();
    });
  }

  it("unmount while recording stops all tracks and the recorder", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }];
    getUserMedia.mockResolvedValue({ getTracks: () => tracks });

    const { result, unmount } = renderHook(() => useVoiceSearch({ apiBaseUrl: "/api/commerce-ai" }));
    await act(async () => {
      await result.current.toggleRecording();
    });
    const recorder = FakeMediaRecorder.instances[0]!;
    expect(recorder.state).toBe("recording");

    unmount();

    expect(recorder.stopCalls).toBe(1);
    expect(recorder.state).toBe("inactive");
    for (const track of tracks) {
      expect(track.stop).toHaveBeenCalledTimes(1);
    }
    // The aborted recording must not be uploaded or touch the unmounted tree.
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(recorder.onstop).toBeNull();
    expect(recorder.ondataavailable).toBeNull();
  });

  it("unmount while getUserMedia is pending stops the late stream", async () => {
    const track = { stop: vi.fn() };
    let grant!: (stream: unknown) => void;
    getUserMedia.mockReturnValue(
      new Promise((resolve) => {
        grant = resolve;
      }),
    );
    vi.stubGlobal("fetch", vi.fn());

    const { result, unmount } = renderHook(() => useVoiceSearch({ apiBaseUrl: "/api/commerce-ai" }));
    let started!: Promise<void>;
    act(() => {
      started = result.current.toggleRecording();
    });

    unmount();
    expect(track.stop).not.toHaveBeenCalled();

    await act(async () => {
      grant({ getTracks: () => [track] });
      await started;
    });

    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(FakeMediaRecorder.instances).toHaveLength(0);
  });

  it("stops the stream when the recorder cannot be created", async () => {
    const track = { stop: vi.fn() };
    getUserMedia.mockResolvedValue({ getTracks: () => [track] });
    vi.stubGlobal(
      "MediaRecorder",
      class {
        constructor() {
          throw new DOMException("unsupported", "NotSupportedError");
        }
      },
    );

    const { result } = renderHook(() => useVoiceSearch({ apiBaseUrl: "/api/commerce-ai" }));
    await act(async () => {
      await result.current.toggleRecording();
    });

    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(result.current.error).not.toBeNull();
  });

  it("survives a StrictMode mount, unmount, mount cycle while recording", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const track = { stop: vi.fn() };
    getUserMedia.mockResolvedValue({ getTracks: () => [track] });

    const { result, unmount } = renderHook(
      () => useVoiceSearch({ apiBaseUrl: "/api/commerce-ai" }),
      { reactStrictMode: true },
    );
    await act(async () => {
      await result.current.toggleRecording();
    });

    // The simulated remount did not leave the hook permanently "unmounted".
    expect(result.current.isRecording).toBe(true);
    expect(FakeMediaRecorder.instances[0]?.state).toBe("recording");
    expect(track.stop).not.toHaveBeenCalled();

    unmount();
    expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it("recorded blob uses mediaRecorder.mimeType", async () => {
    FakeMediaRecorder.mimeType = "audio/ogg;codecs=opus";
    const { fetchMock, next } = stubManualFetch();

    const { result } = renderHook(() =>
      useVoiceSearch({ apiBaseUrl: "/api/commerce-ai", enableTts: false }),
    );
    await record(result);
    const upload = next("/search/voice");
    const form = upload.init.body as FormData;
    const audio = form.get("audio") as File;
    expect(audio.type).toBe("audio/ogg;codecs=opus");
    expect(audio.name).toBe("recording.ogg");

    // An empty type (some browsers) falls back to webm rather than an unlabeled upload.
    fetchMock.mockClear();
    FakeMediaRecorder.mimeType = "";
    await record(result);
    const fallback = next("/search/voice").init.body as FormData;
    expect((fallback.get("audio") as File).type).toBe("audio/webm");
    expect((fallback.get("audio") as File).name).toBe("recording.webm");
  });

  it("TTS plays from an object URL and revokes it on replace", async () => {
    const created: Blob[] = [];
    const createObjectURL = vi.fn((blob: Blob) => {
      created.push(blob);
      return `blob:tts-${created.length}`;
    });
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL }));
    const sources: string[] = [];
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (
      this: HTMLMediaElement,
    ) {
      sources.push(this.getAttribute("src") ?? "");
      return Promise.resolve();
    });
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    const clip = new Blob(["mp3"], { type: "audio/mpeg" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("/tts")
          ? { ok: true, blob: async () => clip }
          : ok({ transcript: "shoes", products: [], meta: searchMeta, ttsText: "Found", ttsPending: true }),
      ),
    );

    const { result } = renderHook(() => useVoiceSearch({ apiBaseUrl: "/api/commerce-ai" }));
    await record(result);
    await waitFor(() => expect(result.current.audioClip).toBe(clip));

    // The clip is played from an object URL, never a data: URL.
    expect(created).toEqual([clip]);
    expect(sources).toEqual(["blob:tts-1"]);
    expect(revokeObjectURL).not.toHaveBeenCalled();

    // Replaying replaces the clip: the previous URL is revoked before the new one plays.
    act(() => result.current.replayAudioSummary());
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:tts-1");
    expect(sources).toEqual(["blob:tts-1", "blob:tts-2"]);
  });

  it("a stale voice result is ignored", async () => {
    const { next } = stubManualFetch();
    const received = vi.fn();
    const transcripts = vi.fn();

    const { result } = renderHook(() => {
      const search = useCommerceAISearch({ apiBaseUrl: "/api/commerce-ai" });
      const voice = useVoiceSearch({
        apiBaseUrl: "/api/commerce-ai",
        enableTts: false,
        beginExternalSearch: search.beginExternalSearch,
        isCurrentRequest: search.isCurrentRequest,
        onTranscript: transcripts,
        onResults: (products, resultMeta) => {
          received(products);
          search.applySearchResult({ products, meta: resultMeta });
          search.setIsLoading(false);
        },
      });
      return { search, voice };
    });

    await record({ get current() { return result.current.voice; } });
    const voiceRequest = next("/search/voice");

    // The shopper types a newer query while the voice request is still in flight.
    let textDone!: Promise<void>;
    act(() => {
      textDone = result.current.search.search("red shoes");
    });
    const textRequest = next("/search");
    expect(voiceRequest.init.signal?.aborted).toBe(true);

    await act(async () => {
      textRequest.resolve(ok({ products: [{ id: "text", name: "Text" }], meta: searchMeta }));
      await textDone;
    });
    await act(async () => {
      voiceRequest.resolve(
        ok({ transcript: "blue boots", products: [{ id: "voice", name: "Voice" }], meta: searchMeta }),
      );
      await Promise.resolve();
    });

    expect(received).not.toHaveBeenCalled();
    expect(transcripts).not.toHaveBeenCalled();
    expect(result.current.search.results.map((card) => card.id)).toEqual(["text"]);
    expect(result.current.search.query).toBe("");
    expect(result.current.voice.isProcessing).toBe(false);
    expect(result.current.voice.error).toBeNull();
  });

  it("applies the voice result when nothing newer started", async () => {
    const { next } = stubManualFetch();
    const received = vi.fn();

    const { result } = renderHook(() => {
      const search = useCommerceAISearch({ apiBaseUrl: "/api/commerce-ai" });
      const voice = useVoiceSearch({
        apiBaseUrl: "/api/commerce-ai",
        enableTts: false,
        beginExternalSearch: search.beginExternalSearch,
        isCurrentRequest: search.isCurrentRequest,
        onResults: (products) => received(products),
      });
      return { search, voice };
    });

    await record({ get current() { return result.current.voice; } });
    await act(async () => {
      next("/search/voice").resolve(
        ok({ transcript: "boots", products: [{ id: "voice", name: "Voice" }], meta: searchMeta }),
      );
      await Promise.resolve();
    });

    await waitFor(() => expect(received).toHaveBeenCalledTimes(1));
    expect(result.current.voice.isProcessing).toBe(false);
  });

  it("pending requests and timers are aborted on unmount", async () => {
    const { next } = stubManualFetch();
    const onResults = vi.fn();
    const { result, unmount } = renderHook(() =>
      useVoiceSearch({ apiBaseUrl: "/api/commerce-ai", onResults }),
    );
    await record(result);
    const request = next("/search/voice");
    expect(request.init.signal?.aborted).toBe(false);

    unmount();

    expect(request.init.signal?.aborted).toBe(true);
    request.resolve(ok({ transcript: "boots", products: [], meta: searchMeta, ttsPending: false }));
    await Promise.resolve();
    expect(onResults).not.toHaveBeenCalled();
  });

  it("aborts a pending TTS request on unmount", async () => {
    const { next } = stubManualFetch();
    const { result, unmount } = renderHook(() => useVoiceSearch({ apiBaseUrl: "/api/commerce-ai" }));
    await record(result);
    await act(async () => {
      next("/search/voice").resolve(
        ok({ transcript: "boots", products: [], meta: searchMeta, ttsText: "Found", ttsPending: true }),
      );
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.isLoadingTts).toBe(true));
    const tts = next("/tts");

    unmount();

    expect(tts.init.signal?.aborted).toBe(true);
  });

  it("a second toggle while getUserMedia is pending does not open a second stream", async () => {
    let grant!: (stream: unknown) => void;
    getUserMedia.mockReturnValue(
      new Promise((resolve) => {
        grant = resolve;
      }),
    );
    vi.stubGlobal("fetch", vi.fn());

    const { result } = renderHook(() => useVoiceSearch({ apiBaseUrl: "/api/commerce-ai" }));
    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = result.current.toggleRecording();
      second = result.current.toggleRecording();
    });
    await act(async () => {
      grant({ getTracks: () => [{ stop: vi.fn() }] });
      await Promise.all([first, second]);
    });

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(FakeMediaRecorder.instances).toHaveLength(1);
  });

  describe("clear() while a voice request is in flight", () => {
    it.each([
      ["rejects with AbortError", true],
      ["still resolves", false],
    ])("when the request %s: no error and no results", async (_name, rejectOnAbort) => {
      const { next } = stubManualFetch({ rejectOnAbort });
      const received = vi.fn();
      const transcripts = vi.fn();

      const { result } = renderHook(() => {
        const search = useCommerceAISearch({ apiBaseUrl: "/api/commerce-ai" });
        const voice = useVoiceSearch({
          apiBaseUrl: "/api/commerce-ai",
          enableTts: false,
          beginExternalSearch: search.beginExternalSearch,
          isCurrentRequest: search.isCurrentRequest,
          onTranscript: transcripts,
          onResults: (products, resultMeta) => {
            received(products);
            search.applySearchResult({ products, meta: resultMeta });
          },
        });
        return { search, voice };
      });

      await record({
        get current() {
          return result.current.voice;
        },
      });
      const request = next("/search/voice");
      act(() => {
        result.current.search.clear();
      });
      expect(request.init.signal?.aborted).toBe(true);

      await act(async () => {
        request.resolve(
          ok({ transcript: "boots", products: [{ id: "late", name: "Late" }], meta: searchMeta }),
        );
        await Promise.resolve();
      });

      expect(result.current.voice.error).toBeNull();
      expect(result.current.voice.isProcessing).toBe(false);
      expect(received).not.toHaveBeenCalled();
      expect(transcripts).not.toHaveBeenCalled();
      expect(result.current.search.results).toEqual([]);
      expect(result.current.search.hasSearched).toBe(false);
    });
  });
});
