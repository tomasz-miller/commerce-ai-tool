export class SearchTimeoutError extends Error {
  readonly step: string;

  constructor(step: string, timeoutMs: number) {
    super(`Search timed out after ${timeoutMs}ms at step: ${step}`);
    this.name = "SearchTimeoutError";
    this.step = step;
  }
}

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  step: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new SearchTimeoutError(step, timeoutMs));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
