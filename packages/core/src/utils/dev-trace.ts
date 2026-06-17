function isDevTracingEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.CAT_DEBUG === "true";
}

export function logSearchTrace(step: string, data: Record<string, unknown>): void {
  if (!isDevTracingEnabled()) {
    return;
  }

  console.info(
    `[commerce-ai-tool/core] search.trace ${step}:`,
    JSON.stringify(data, null, 2),
  );
}
