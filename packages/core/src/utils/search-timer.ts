export interface SearchTimings {
  steps: Record<string, number>;
  totalMs: number;
}

export interface SearchTimer {
  mark(step: string): void;
  finish(): SearchTimings;
}

export function createSearchTimer(): SearchTimer {
  const start = performance.now();
  let lastMark = start;
  const steps: Record<string, number> = {};

  return {
    mark(step: string) {
      const now = performance.now();
      steps[step] = Math.round(now - lastMark);
      lastMark = now;
    },
    finish() {
      return {
        steps,
        totalMs: Math.round(performance.now() - start),
      };
    },
  };
}

export function shouldIncludeSearchTimings(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.CAT_DEBUG === "true";
}
