import { loadDemoEnv } from "./env.js";
import { createDemoBffApp, resolveBffHost, resolveBffPort } from "./bff.js";
import { shutdownOnSignals, startLangfuseTracing } from "./tracing.js";

const { loadedFrom } = loadDemoEnv();
const host = resolveBffHost();
const port = resolveBffPort();

// After loadDemoEnv (the Langfuse keys come from the env files) and before the first request.
const tracing = startLangfuseTracing();

const server = createDemoBffApp().listen(port, host, () => {
  const sources = loadedFrom.length > 0 ? loadedFrom.join(", ") : "process environment";
  console.log(`demo-angular BFF listening on http://${host}:${port} (env: ${sources})`);
});

if (tracing) {
  shutdownOnSignals(tracing, process, process.exit, server);
}
