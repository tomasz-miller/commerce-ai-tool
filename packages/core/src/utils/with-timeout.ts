export class SearchTimeoutError extends Error {
  readonly step: string;

  constructor(step: string, timeoutMs: number) {
    super(`Search timed out after ${timeoutMs}ms at step: ${step}`);
    this.name = "SearchTimeoutError";
    this.step = step;
  }
}

/**
 * Runs one pipeline step with its own AbortSignal. The signal aborts when the step times out
 * (reason: the `SearchTimeoutError`) or when `parent` aborts (reason: the parent's reason), and
 * the returned promise rejects with that same reason without waiting for `fn` to settle.
 * A step whose callee cannot take a signal still times out; the signal is then simply unused.
 */
export function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  step: string,
  parent?: AbortSignal,
): Promise<T> {
  if (parent?.aborted) {
    return Promise.reject(toError(parent.reason));
  }

  const controller = new AbortController();
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const settle = (): boolean => {
      if (settled) {
        return false;
      }
      settled = true;
      clearTimeout(timer);
      parent?.removeEventListener("abort", onParentAbort);
      return true;
    };
    const fail = (reason: unknown) => {
      if (settle()) {
        controller.abort(reason);
        reject(toError(reason));
      }
    };
    const onParentAbort = () => fail(parent?.reason);
    const timer = setTimeout(() => fail(new SearchTimeoutError(step, timeoutMs)), timeoutMs);
    parent?.addEventListener("abort", onParentAbort, { once: true });

    let promise: Promise<T>;
    try {
      promise = fn(controller.signal);
    } catch (error) {
      if (settle()) {
        reject(toError(error));
      }
      return;
    }

    promise.then(
      (value) => {
        if (settle()) {
          resolve(value);
        }
      },
      (error: unknown) => {
        if (settle()) {
          reject(toError(error));
        }
      },
    );
  });
}

/** Rejection reasons pass through unchanged when they are Errors (DOMException included). */
function toError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error(String(reason));
}
