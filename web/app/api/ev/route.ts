import { redis, rateLimit, ipOf } from "@/lib/redis";
import { bump, parseEvBody } from "@/lib/evServer";

export const runtime = "nodejs";

// Fire-and-forget analytics beacon for the two client-only funnel stages (play, share).
// Always returns 204 and never leaks data or errors — invalid/garbage bodies are ignored, and a
// rate-limited caller gets the same silent 204 (the beacon contract never exposes outcomes).
// 60/min/IP bounds analytics poisoning and ev:active set stuffing without touching real play.
export async function POST(req: Request) {
  if (!(await rateLimit(`rl:ev:${ipOf(req)}`, 60, 60))) return new Response(null, { status: 204 });
  const parsed = parseEvBody(await req.json().catch(() => null));
  if (parsed) await bump(redis, parsed.ev, { uid: parsed.uid, mode: parsed.mode });
  return new Response(null, { status: 204 });
}
