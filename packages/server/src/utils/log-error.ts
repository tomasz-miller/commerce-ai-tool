function isDevLoggingEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.CAT_DEBUG === "true";
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function logServerError(handler: string, error: unknown, context?: Record<string, unknown>): void {
  if (!isDevLoggingEnabled()) {
    return;
  }

  const prefix = `[commerce-ai-tool/server] ${handler}`;

  console.error(`${prefix} failed: ${formatError(error)}`);

  if (context && Object.keys(context).length > 0) {
    console.error(`${prefix} context:`, context);
  }

  if (error instanceof Error && error.stack) {
    console.error(error.stack);
  }

  if (error instanceof Error && error.cause) {
    console.error(`${prefix} caused by:`, error.cause);
  }
}

export function logServerWarning(handler: string, message: string, context?: Record<string, unknown>): void {
  if (!isDevLoggingEnabled()) {
    return;
  }

  const prefix = `[commerce-ai-tool/server] ${handler}`;
  console.warn(`${prefix}: ${message}`);

  if (context && Object.keys(context).length > 0) {
    console.warn(`${prefix} context:`, context);
  }
}
