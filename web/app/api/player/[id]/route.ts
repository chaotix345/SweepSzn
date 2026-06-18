import { NextResponse } from "next/server";
import { getPlayersByIds, getPersonVariants } from "@/lib/data";
import { accoladesFor, accoladeLine, careerJourney } from "@/lib/playerMeta";
import { rateLimit, ipOf } from "@/lib/redis";

export const runtime = "nodejs";

// Lazy dossier data for one drafted/candidate variant: descriptive biography (accolades + career arc)
// plus the per-season context (age / games / minutes / TS%) not shipped on the lean draft candidate.
// All descriptive — real greatness, not engine reward — so it never hints the draft (DESIGN.md §12).
// Fetched on demand when a player row is expanded.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await rateLimit(`rl:player:${ipOf(req)}`, 120, 60))) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }
  const { id } = await params;
  if (!/^[a-z0-9_]{1,64}$/.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const [p] = getPlayersByIds([id]);
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
  const pid = p.person_id ?? p.id;
  const acc = accoladesFor(pid);
  return NextResponse.json({
    id: p.id, name: p.name, team: p.team, year: p.year, decade: p.decade,
    age: p.age ?? null, g: p.g ?? null, mp: p.mp ?? null, ts: p.ts ?? null,
    defense_estimated: !!p.defense_estimated,
    accolades: acc, accoladeLine: acc ? accoladeLine(acc) : "",
    journey: careerJourney(getPersonVariants(pid)),
  });
}
