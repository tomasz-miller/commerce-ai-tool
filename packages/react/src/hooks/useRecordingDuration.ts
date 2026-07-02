import { useEffect, useState } from "react";

export function formatRecordingDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function useRecordingDuration(isRecording: boolean): number {
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (!isRecording) {
      setDuration(0);
      return;
    }

    const interval = setInterval(() => {
      setDuration((current) => current + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [isRecording]);

  return duration;
}
