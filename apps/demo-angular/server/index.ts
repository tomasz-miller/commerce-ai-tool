import { loadDemoEnv } from "./env.js";
import { createDemoBffApp, resolveBffHost, resolveBffPort } from "./bff.js";

const { loadedFrom } = loadDemoEnv();
const host = resolveBffHost();
const port = resolveBffPort();

createDemoBffApp().listen(port, host, () => {
  const sources = loadedFrom.length > 0 ? loadedFrom.join(", ") : "process environment";
  console.log(`demo-angular BFF listening on http://${host}:${port} (env: ${sources})`);
});
