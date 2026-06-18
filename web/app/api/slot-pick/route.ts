import { after } from "next/server";
import { redis, rateLimit, ipOf } from "@/lib/redis";
import { parseSlotPick, logSlotPick } from "@/lib/socialStore";

export const runtime = "nodejs";

// Silent crowd-signal logging: counts which player a user locked at each slot, per (mode, spin)
// config. Always 204 (beacon contract); the write runs in after() so the response never waits on
// Redis. The client fires this only AFTER a slot is committed, so the data can never act as a
// pre-commit hint (DESIGN.md §12). The UI that reads these counts ships later, once launch volume
// makes them non-misleading. 150/min/IP bounds stuffing (a real game locks 5 slots).
export async function POST(req: Request) {
  if (!(await rateLimit(`rl:slotpick:${ipOf(req)}`, 150, 60))) return new Response(null, { status: 204 });
  const parsed = parseSlotPick(await req.json().catch(() => null));
  if (parsed) after(() => logSlotPick(redis, parsed));
  return new Response(null, { status: 204 });
}
