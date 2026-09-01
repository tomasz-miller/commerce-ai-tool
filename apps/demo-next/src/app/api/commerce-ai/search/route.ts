import { getCommerceAIHandlers } from "@/lib/commerce-ai-handlers";

export async function GET() {
  return getCommerceAIHandlers().health();
}

export async function POST(req: Request) {
  return getCommerceAIHandlers().search(req);
}
