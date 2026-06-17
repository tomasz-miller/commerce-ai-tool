import { useCallback, useRef, useState } from "react";
import type { ProductCard, SearchResult } from "@commerce-ai-tool/core";
import { appendLocaleFields, type SearchLocaleProps } from "./useCommerceAISearch.js";

export interface UseVoiceSearchOptions extends SearchLocaleProps {
  apiBaseUrl: string;
  onResults?: (results: ProductCard[], meta: SearchResult["meta"]) => void;
  onTranscript?: (transcript: string) => void;
  enableTts?: boolean;
}

function playAudioSummary(base64: string): void {
  const audio = new Audio(`data:audio/mpeg;base64,${base64}`);
  void audio.play();
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
  } = options;
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioSummary, setAudioSummary] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const baseUrl = apiBaseUrl.replace(/\/$/, "");

  const clearAudioSummary = useCallback(() => {
    setAudioSummary(null);
  }, []);

  const replayAudioSummary = useCallback(() => {
    if (audioSummary) {
      playAudioSummary(audioSummary);
    }
  }, [audioSummary]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    setAudioSummary(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setIsProcessing(true);

        try {
          const formData = new FormData();
          formData.append("audio", blob, "recording.webm");
          appendLocaleFields(formData, { queryLocale, catalogLocale, locale });
          formData.append("enableTts", String(enableTts));

          const response = await fetch(`${baseUrl}/search/voice`, {
            method: "POST",
            body: formData,
          });

          if (!response.ok) {
            const data = (await response.json()) as { error?: string };
            throw new Error(data.error ?? "Voice search failed");
          }

          const data = (await response.json()) as {
            transcript: string;
            products: ProductCard[];
            meta: SearchResult["meta"];
            ttsText?: string;
            audioSummary?: string;
          };

          onTranscript?.(data.transcript);
          onResults?.(data.products, data.meta);

          if (data.audioSummary) {
            setAudioSummary(data.audioSummary);
            playAudioSummary(data.audioSummary);
          } else {
            setAudioSummary(null);
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : "Voice search failed");
          setAudioSummary(null);
        } finally {
          setIsProcessing(false);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Microphone access denied");
    }
  }, [baseUrl, catalogLocale, enableTts, locale, onResults, onTranscript, queryLocale]);

  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      stopRecording();
    } else {
      await startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  return {
    isRecording,
    isProcessing,
    error,
    audioSummary,
    clearAudioSummary,
    replayAudioSummary,
    toggleRecording,
    stopRecording,
  };
}
