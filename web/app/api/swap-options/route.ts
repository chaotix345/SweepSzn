import { NextResponse } from "next/server";
import { getSwapOptions } from "@/lib/data";
import { rateLimit, ipOf } from "@/lib/redis";
import type { Slot } from "@/lib/types";

export const runtime = "nodejs";

const SLOTS = new Set(["PG", "SG", "SF", "PF", "C"]);

// The What-If Lab's swap options for one slot: every draftable player from that slot's (team, decade)
// who is eligible there, fame-sorted. Descriptive only — the Lab re-scores a mutated lineup via
// /api/evaluate after the user picks, so the options themselves never reveal an engine ranking
// (DESIGN.md §12). Post-commit UI; rate-limited like the other read routes.
export async function GET(req: Request) {
  if (!(await rateLimit(`rl:swap:${ipOf(req)}`, 120, 60))) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }
  const u = new URL(req.url);
  const team = u.searchParams.get("team") ?? "";
  const decade = u.searchParams.get("decade") ?? "";
  const slot = u.searchParams.get("slot") ?? "";
  if (!/^[A-Za-z]{2,4}$/.test(team) || !/^\d{4}s$/.test(decade) || !SLOTS.has(slot)) {
    return NextResponse.json({ error: "bad params" }, { status: 400 });
  }
  return NextResponse.json({ candidates: getSwapOptions(team, decade, slot as Slot) });
}
