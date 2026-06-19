import { after } from "next/server";
import { redis, rateLimit, ipOf } from "@/lib/redis";
import { bump, parseEvBody } from "@/lib/evServer";

export const runtime = "nodejs";

// Fire-and-forget analytics beacon for the two client-only funnel stages (play, share).
// Always returns 204 and never leaks data or errors — invalid/garbage bodies are ignored, and a
// rate-limited caller gets the same silent 204 (the beacon contract never exposes outcomes).
// 60/min/IP bounds analytics poisoning and ev:active set stuffing without touching real play.
// The bump() runs in after() so the 204 is returned without waiting on Redis — matches every other
// bump() callsite and honors evServer's "never block a user-facing route" contract.
export async function POST(req: Request) {
  if (!(await rateLimit(`rl:ev:${ipOf(req)}`, 60, 60))) return new Response(null, { status: 204 });
  const parsed = parseEvBody(await req.json().catch(() => null));
  if (parsed) after(() => bump(redis, parsed.ev, { uid: parsed.uid, mode: parsed.mode, source: parsed.source, ref: parsed.ref }));
  return new Response(null, { status: 204 });
}
