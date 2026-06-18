import { NextResponse } from "next/server";
import { getSession } from "@/lib/authServer";
import { getResults } from "@/lib/profileStore";
import { decodeLineup } from "@/lib/share";
import { getPlayersByIds } from "@/lib/data";
import { playerTraits } from "@/lib/traits";
import { rateLimit, ipOf } from "@/lib/redis";
import { computeBadges, type DexPlayer } from "@/lib/dex";

export const runtime = "nodejs";

// The signed-in user's Drafted Dex: every player they've ever fielded (derived from their stored
// results), plus earned achievement badges. All descriptive — the collection rewards exploring the
// dataset, never optimizing a round (DESIGN.md §12). Auth-gated; falls back to a sign-in prompt client-side.
export async function GET(req: Request) {
  if (!(await rateLimit(`rl:dex:${ipOf(req)}`, 60, 60))) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "auth_required" }, { status: 401 });

  const results = await getResults(session.uid);
  const seen = new Set<string>();
  for (const r of results) for (const id of decodeLineup(r.encoded)) seen.add(id);

  const players: DexPlayer[] = getPlayersByIds([...seen]).map((p) => ({
    id: p.id, personId: p.person_id ?? p.id, name: p.name, team: p.team, decade: p.decade,
    pos: p.pos, eligible: p.eligible && p.eligible.length ? p.eligible : [p.pos],
    pts: p.pts ?? null, trb: p.trb ?? null, ast: p.ast ?? null, stl: p.stl ?? null, blk: p.blk ?? null,
    fame: p.fame ?? 0, traits: playerTraits(p),
  }));
  const badges = computeBadges(players, results.map((r) => ({ grade: r.grade })));
  return NextResponse.json({ players, total: results.length, badges });
}
