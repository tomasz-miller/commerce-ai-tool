/**
 * Next.js loads this file for both Node and Edge. Keep it free of Node-only
 * imports so Edge instrumentation does not pull Express / OpenTelemetry.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  await import("./instrumentation.node");
}
