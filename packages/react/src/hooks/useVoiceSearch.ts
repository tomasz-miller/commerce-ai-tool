import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  audioFromBase64,
  createAudioPlayer,
  createCommerceAIApiClient,
  messageForError,
  stopMediaStream,
  type AudioPlayer,
  type CommerceAISearchMessages,
  type MissionSearchResult,
  type ProductCard,
  type SearchResult,
  type VoiceSearchRequest,
} from "@commerce-ai-tool/core/client";
import { useLatestRef, useMessagesRef } from "./useLatestRef.js";
import { buildLocalePayload, type SearchLocaleProps } from "./useCommerceAISearch.js";

export interface UseVoiceSearchOptions extends SearchLocaleProps {
  apiBaseUrl: string;
  onResults?: (
    results: ProductCard[],
    meta: SearchResult["meta"],
    extras?: { mission?: MissionSearchResult },
  ) => void;
  onTranscript?: (transcript: string) => void;
  enableTts?: boolean;
  enableMissions?: boolean;
  /** Host message overrides. Errors are always taken from these, never from the server's text. */
  messages?: Partial<CommerceAISearchMessages>;
  /**
   * Pass `useCommerceAISearch().beginExternalSearch` and `isCurrentRequest` so a voice search is
   * ordered against text and image searches: a newer search aborts it, and its late result is
   * dropped. Without them the hook only guards against its own earlier recordings.
   */
  beginExternalSearch?: () => { requestId: number; signal: AbortSignal };
  isCurrentRequest?: (requestId: number) => boolean;
}

export function useVoiceSearch(options: UseVoiceSearchOptions) {
  const {
    apiBaseUrl,
    queryLocale,
    catalogLocale,
    locale,
    onResults,
    onTranscript,
    enableTts = true,
    enableMissions = false,
    messages,
    beginExternalSearch,
    isCurrentRequest,
  } = options;
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoadingTts, setIsLoadingTts] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The spoken summary clip, kept so the widget can replay it. */
  const [audioClip, setAudioClip] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);
  const messagesRef = useMessagesRef(messages);
  const beginExternalSearchRef = useLatestRef(beginExternalSearch);
  const isCurrentRequestRef = useLatestRef(isCurrentRequest);
  /** The microphone stream of the recording in progress; its tracks keep the mic indicator on. */
  const streamRef = useRef<MediaStream | null>(null);
  /** True between getUserMedia being requested and its stream arriving (blocks a second start). */
  const startingRef = useRef(false);
  const mountedRef = useRef(false);
  const requestControllerRef = useRef<AbortController | null>(null);
  /** Request ids for use without a search hook to order against. */
  const localRequestIdRef = useRef(0);
  /** Counts finished recordings, so only the latest one clears the processing flags. */
  const runIdRef = useRef(0);

  const client = useMemo(() => createCommerceAIApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const playClip = useCallback((clip: Blob) => {
    playerRef.current ??= createAudioPlayer();
    void playerRef.current.play(clip);
  }, []);

  /** Detaches the recorder's handlers, stops it and releases the microphone. Safe to repeat. */
  const releaseRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    mediaRecorderRef.current = null;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      if (recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          // Already stopped by the browser; the tracks below are what matter.
        }
      }
    }
    stopMediaStream(streamRef.current);
    streamRef.current = null;
  }, []);

  // `mountedRef` is set here, not at declaration, so a StrictMode mount/unmount/mount probe ends
  // mounted. A real unmount releases the microphone, aborts the request and stops playback.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      releaseRecording();
      requestControllerRef.current?.abort();
      requestControllerRef.current = null;
      playerRef.current?.dispose();
      playerRef.current = null;
    };
  }, [releaseRecording]);

  /**
   * Starts a voice request that is ordered against the other searches (see
   * `beginExternalSearch`) and is aborted on unmount or by a newer voice request.
   */
  const beginRequest = useCallback(() => {
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    const external = beginExternalSearchRef.current?.();
    if (external) {
      if (external.signal.aborted) {
        controller.abort();
      } else {
        external.signal.addEventListener("abort", () => controller.abort(), { once: true });
      }
      return { requestId: external.requestId, signal: controller.signal };
    }
    return { requestId: ++localRequestIdRef.current, signal: controller.signal };
  }, [beginExternalSearchRef]);

  const isCurrent = useCallback(
    (requestId: number) =>
      mountedRef.current &&
      (isCurrentRequestRef.current
        ? isCurrentRequestRef.current(requestId)
        : requestId === localRequestIdRef.current),
    [isCurrentRequestRef],
  );

  /** Sets (or clears) the clip the widget can replay. */
  const setClip = setAudioClip;

  const clearAudioSummary = useCallback(() => {
    playerRef.current?.stop();
    setClip(null);
  }, [setClip]);

  const replayAudioSummary = useCallback(() => {
    if (audioClip) {
      playClip(audioClip);
    }
  }, [audioClip, playClip]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      setIsProcessing(true);
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, []);

  const startRecording = useCallback(async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    setError(null);
    playerRef.current?.stop();
    setClip(null);

    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current) {
        // The widget went away while the permission prompt was open: do not keep the mic on.
        stopMediaStream(stream);
        return;
      }
      const mediaRecorder = new MediaRecorder(stream);
      // This recording's own chunks, so a later recording cannot swap them out underneath it.
      const chunks: Blob[] = [];
      streamRef.current = stream;
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stopMediaStream(stream);
        // Only clear the shared refs when they still belong to this recorder.
        if (mediaRecorderRef.current === mediaRecorder) {
          streamRef.current = null;
          mediaRecorderRef.current = null;
        }
        // The container the browser really recorded (webm on Chrome, mp4 on Safari), not a literal.
        const blob = new Blob(chunks, { type: mediaRecorder.mimeType });
        const runId = ++runIdRef.current;
        const { requestId, signal } = beginRequest();
        setIsProcessing(true);

        try {
          const fields: VoiceSearchRequest = {
            ...buildLocalePayload({ queryLocale, catalogLocale, locale }),
            enableTts: String(enableTts),
            ...(enableMissions ? { enableMissions: "true" } : {}),
          };
          const data = await client.searchByVoice(blob, fields, { signal });
          if (!isCurrent(requestId)) {
            // A newer search (or unmount) superseded this one: its result must not show.
            return;
          }

          onTranscript?.(data.transcript);
          onResults?.(data.products, data.meta, { mission: data.mission });
          setIsProcessing(false);

          if (data.audioSummary) {
            const clip = audioFromBase64(data.audioSummary);
            setClip(clip);
            playClip(clip);
          } else if (enableTts && data.ttsText && data.ttsPending) {
            setIsLoadingTts(true);
            try {
              const clip = await client.tts({ text: data.ttsText }, { signal });
              if (!isCurrent(requestId)) return;
              setClip(clip);
              playClip(clip);
            } catch {
              // The results are already shown; a missing clip is not an error for the shopper.
              if (isCurrent(requestId)) setClip(null);
            }
          } else {
            setClip(null);
          }
        } catch (err) {
          // Aborted by a reset, a newer search or unmount: not a failure the shopper should see.
          if (signal.aborted || !mountedRef.current || !isCurrent(requestId)) return;
          setError(messageForError(err, messagesRef.current, { fallback: "searchFailed" }));
          setClip(null);
        } finally {
          if (mountedRef.current && runIdRef.current === runId) {
            setIsProcessing(false);
            setIsLoadingTts(false);
          }
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      // `new MediaRecorder` can throw after the permission was granted.
      stopMediaStream(stream);
      streamRef.current = null;
      if (!mountedRef.current) return;
      setError(
        messageForError(err, messagesRef.current, {
          device: "microphone",
          fallback: "microphoneUnavailable",
        }),
      );
    } finally {
      startingRef.current = false;
    }
  }, [
    beginRequest,
    catalogLocale,
    client,
    enableMissions,
    enableTts,
    isCurrent,
    locale,
    messagesRef,
    onResults,
    onTranscript,
    playClip,
    queryLocale,
    setClip,
  ]);

  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      stopRecording();
    } else {
      await startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    isRecording,
    isProcessing,
    isLoadingTts,
    error,
    clearError,
    /** The spoken summary clip, kept so the widget can replay it. */
    audioClip,
    clearAudioSummary,
    replayAudioSummary,
    toggleRecording,
    stopRecording,
  };
}
