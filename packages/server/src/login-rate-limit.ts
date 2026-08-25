export const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 10;
export const LOGIN_RATE_LIMIT_MESSAGE = "Too many login attempts. Try again later.";

export const ORDER_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const ORDER_RATE_LIMIT_MAX_ATTEMPTS = 20;
export const ORDER_RATE_LIMIT_MESSAGE = "Too many order attempts. Try again later.";

export class TooManyRequestsError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number, message = LOGIN_RATE_LIMIT_MESSAGE) {
    super(message);
    this.name = "TooManyRequestsError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface LoginAttemptLimiter {
  consume(key: string): void;
}

export function createLoginAttemptLimiter(
  options: { windowMs?: number; limit?: number } = {},
): LoginAttemptLimiter {
  const windowMs = options.windowMs ?? LOGIN_RATE_LIMIT_WINDOW_MS;
  const limit = options.limit ?? LOGIN_RATE_LIMIT_MAX_ATTEMPTS;
  const attempts = new Map<string, { count: number; resetAt: number }>();

  return {
    consume(key: string) {
      const now = Date.now();
      const current = attempts.get(key);

      if (!current || current.resetAt <= now) {
        attempts.set(key, { count: 1, resetAt: now + windowMs });
        return;
      }

      if (current.count >= limit) {
        throw new TooManyRequestsError(Math.max(1, Math.ceil((current.resetAt - now) / 1000)));
      }

      current.count += 1;
    },
  };
}

export function clientKeyFromWebHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }

  const realIp = headers.get("x-real-ip")?.trim();
  return realIp || "local";
}
