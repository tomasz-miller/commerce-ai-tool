import { createNextHandlers, loadConfigFromEnv } from "@commerce-ai-tool/server";

const handlers = createNextHandlers(loadConfigFromEnv());

export const POST = handlers.createOrder;
