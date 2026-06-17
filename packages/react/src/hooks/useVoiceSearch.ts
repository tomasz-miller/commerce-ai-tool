import { useCallback, useRef, useState } from "react";
import type { ProductCard, SearchResult } from "@commerce-ai-tool/core";

export interface UseVoiceSearchOptions {
  apiBaseUrl: string;
  locale?: string;
  onResults?: (results: ProductCard[], meta: SearchResult["meta"]) => void;
  onTranscript?: (transcript: string) => void;
  enableTts?: boolean;
}

export function useVoiceSearch(options: UseVoiceSearchOptions) {
  const { apiBaseUrl, locale = "en", onResults, onTranscript, enableTts = true } = options;
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const baseUrl = apiBaseUrl.replace(/\/$/, "");

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);

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
          formData.append("locale", locale);
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
            audioSummary?: string;
          };

          onTranscript?.(data.transcript);
          onResults?.(data.products, data.meta);

          if (data.audioSummary) {
            const audio = new Audio(`data:audio/mpeg;base64,${data.audioSummary}`);
            void audio.play();
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : "Voice search failed");
        } finally {
          setIsProcessing(false);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Microphone access denied");
    }
  }, [baseUrl, enableTts, locale, onResults, onTranscript]);

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
    toggleRecording,
    stopRecording,
  };
}
