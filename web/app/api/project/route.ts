import { NextResponse } from "next/server";
import { getPlayersByIds, getDraftablePool, getCoefficients } from "@/lib/data";
import { projectRoster, projectionAllowed } from "@/lib/projection";
import { rateLimit, ipOf } from "@/lib/redis";
import type { Slot } from "@/lib/types";

export const runtime = "nodejs";

const SLOTS: Slot[] = ["PG", "SG", "SF", "PF", "C"];

// Live floor/ceiling win projection for the roster drafted so far. Called once per placement on the
// fit-assist modes only (the gate mirrors lib/data.ts's showFit). Read-only — never touches the
// trace, the result, or the engine's deterministic spin path (82-0 parity).
export async function POST(req: Request) {
  if (!(await rateLimit(`rl:project:${ipOf(req)}`, 120, 60))) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  const seed: string = typeof body?.seed === "string" ? body.seed : "";
  // Gate first: a partial-roster projection is a fit-class signal, so it is withheld on competitive
  // / blind seeds (Daily, Factor Hunt, Surgeon, HoopIQ, Challenge, prime-daily) — DESIGN.md §12.
  if (!projectionAllowed(seed)) return NextResponse.json({ gated: true });

  // lineup is slot-ordered (PG, SG, SF, PF, C); each entry is a player id or null for an open slot.
  const raw: unknown[] = Array.isArray(body?.lineup) ? body.lineup : [];
  const lineup: (string | null)[] = SLOTS.map((_, i) => {
    const v = raw[i];
    return typeof v === "string" && /^[a-z0-9_]{1,64}$/.test(v) ? v : null;
  });
  const draftedIds = lineup.filter((x): x is string => x !== null);
  if (draftedIds.length === 0) return NextResponse.json({ error: "no players to project" }, { status: 400 });

  const drafted = getPlayersByIds(draftedIds);
  const openSlots = SLOTS.filter((_, i) => lineup[i] === null);
  const pool = getDraftablePool(seed.startsWith("prime-"));
  const { floor, ceiling, n } = projectRoster(drafted, pool, openSlots, getCoefficients());
  return NextResponse.json({ floor, ceiling, n });
}
