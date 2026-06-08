import { redis } from "@/lib/redis";
import { bump, parseEvBody } from "@/lib/evServer";

export const runtime = "nodejs";

// Fire-and-forget analytics beacon for the two client-only funnel stages (play, share).
// Always returns 204 and never leaks data or errors — invalid/garbage bodies are ignored.
export async function POST(req: Request) {
  const parsed = parseEvBody(await req.json().catch(() => null));
  if (parsed) await bump(redis, parsed.ev, { uid: parsed.uid, mode: parsed.mode });
  return new Response(null, { status: 204 });
}
