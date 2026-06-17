import { createNextHandlers, loadConfigFromEnv } from "@commerce-ai-tool/server";
import type { NextHandlers } from "@commerce-ai-tool/server";

let handlers: NextHandlers | null = null;

function getHandlers(): NextHandlers {
  if (!handlers) {
    handlers = createNextHandlers(loadConfigFromEnv());
  }
  return handlers;
}

export async function POST(req: Request) {
  return getHandlers().tts(req);
}
