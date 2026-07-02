import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatRecordingDuration, useRecordingDuration } from "./useRecordingDuration.js";

describe("formatRecordingDuration", () => {
  it("formats seconds as mm:ss", () => {
    expect(formatRecordingDuration(0)).toBe("0:00");
    expect(formatRecordingDuration(8)).toBe("0:08");
    expect(formatRecordingDuration(68)).toBe("1:08");
  });
});

describe("useRecordingDuration", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts at 0 when recording begins", () => {
    vi.useFakeTimers();
    const { result } = renderHook(({ isRecording }) => useRecordingDuration(isRecording), {
      initialProps: { isRecording: true },
    });

    expect(result.current).toBe(0);
  });

  it("increments every second while recording", () => {
    vi.useFakeTimers();
    const { result } = renderHook(({ isRecording }) => useRecordingDuration(isRecording), {
      initialProps: { isRecording: true },
    });

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current).toBe(3);
  });

  it("resets when recording stops", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ isRecording }) => useRecordingDuration(isRecording), {
      initialProps: { isRecording: true },
    });

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    rerender({ isRecording: false });

    expect(result.current).toBe(0);
  });
});
