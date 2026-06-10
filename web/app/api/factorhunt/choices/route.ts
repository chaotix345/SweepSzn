import { NextResponse } from "next/server";
import { getPlayersByIds, getCoefficients } from "@/lib/data";
import { evaluateLineup } from "@/lib/engine";
import { buildFhChoices, fhSeedOk } from "@/lib/factorHunt";
import { rateLimit, ipOf } from "@/lib/redis";

export const runtime = "nodejs";

// Pre-reveal prediction choices. Evaluates server-side and returns ONLY { ask, choices } —
// no result, no factor values, no answer — so locking a prediction happens before anything
// about the record is on the wire (the no-negative-factors flip to "best" included).

export async function POST(req: Request) {
  if (!(await rateLimit(`rl:fhchoices:${ipOf(req)}`, 60, 60))) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  if (!fhSeedOk(body?.seed)) return NextResponse.json({ error: "bad seed" }, { status: 400 });
  const ids: string[] = Array.isArray(body?.ids)
    ? body.ids.filter((x: unknown): x is string => typeof x === "string" && /^[a-z0-9_]{1,64}$/.test(x))
    : [];
  if (ids.length !== 5) return NextResponse.json({ error: "exactly 5 players required" }, { status: 400 });
  const players = getPlayersByIds(ids);
  const people = new Set(players.map((p) => p.person_id ?? p.id));
  if (players.length !== 5 || people.size !== players.length) {
    return NextResponse.json({ error: "lineup must contain 5 unique players" }, { status: 400 });
  }
  const result = evaluateLineup(players, getCoefficients());
  const c = buildFhChoices(result.factors, body.seed);
  if (!c) return NextResponse.json({ error: "no factors" }, { status: 422 });
  return NextResponse.json({ ask: c.ask, choices: c.choices });
}
