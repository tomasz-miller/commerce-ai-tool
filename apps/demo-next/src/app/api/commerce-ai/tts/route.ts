import { getCommerceAIHandlers } from "@/lib/commerce-ai-handlers";

export async function POST(req: Request) {
  return getCommerceAIHandlers().tts(req);
}
