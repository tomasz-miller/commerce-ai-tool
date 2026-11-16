import { getCommerceAIRoute } from "@/lib/commerce-ai-handlers";

// One catch-all file serves every commerce-ai route (search, voice, image, TTS, cart, orders).
// Add `export const maxDuration = 60;` here only if your platform's default function timeout is
// shorter than your slowest voice or image search.
export const GET = (req: Request, ctx: { params: Promise<{ path: string[] }> }) =>
  getCommerceAIRoute().GET(req, ctx);

export const POST = (req: Request, ctx: { params: Promise<{ path: string[] }> }) =>
  getCommerceAIRoute().POST(req, ctx);
