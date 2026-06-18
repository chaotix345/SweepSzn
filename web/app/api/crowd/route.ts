import { NextResponse } from "next/server";
import { crowdForSlot } from "@/lib/socialStore";
import { getPersonName } from "@/lib/data";
import { redis, rateLimit, ipOf } from "@/lib/redis";

export const runtime = "nodejs";

const MODES = new Set(["daily", "classic", "hoopiq", "challenge", "factorhunt", "prime", "blueprint", "surgeon"]);
const SLOTS = new Set(["PG", "SG", "SF", "PF", "C"]);
const SPINKEY_RE = /^[A-Za-z]{2,4}\|[A-Za-z0-9]{2,6}$/;

// How others played a slot for this (mode, spin) config — read AFTER the user has locked it (the
// client only calls this post-confirm), so it is social context, never a pre-commit hint. Volume-
// gated in crowdForSlot: below the threshold it returns null and the UI shows nothing (DESIGN.md §12).
export async function GET(req: Request) {
  if (!(await rateLimit(`rl:crowd:${ipOf(req)}`, 120, 60))) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }
  const u = new URL(req.url);
  const mode = u.searchParams.get("mode") ?? "";
  const spinKey = u.searchParams.get("spinKey") ?? "";
  const slot = u.searchParams.get("slot") ?? "";
  if (!MODES.has(mode) || !SPINKEY_RE.test(spinKey) || !SLOTS.has(slot)) {
    return NextResponse.json({ error: "bad params" }, { status: 400 });
  }
  const crowd = await crowdForSlot(redis, mode, spinKey, slot);
  if (!crowd) return NextResponse.json({ crowd: null });
  return NextResponse.json({
    crowd: {
      total: crowd.total,
      choices: crowd.choices.map((c) => ({
        personId: c.personId,
        name: getPersonName(c.personId) ?? c.personId,
        pct: c.pct,
      })),
    },
  });
}
