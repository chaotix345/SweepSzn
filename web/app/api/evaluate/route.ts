import { NextResponse, after } from "next/server";
import { getPlayersByIds, getCoefficients } from "@/lib/data";
import { evaluateLineup } from "@/lib/engine";
import { redis } from "@/lib/redis";
import { bump } from "@/lib/evServer";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter((x: unknown) => typeof x === "string") : [];
  if (ids.length !== 5) return NextResponse.json({ error: "exactly 5 players required" }, { status: 400 });
  const players = getPlayersByIds(ids);
  const people = new Set(players.map((p) => p.person_id ?? p.id));
  if (players.length !== 5 || people.size !== players.length) {
    return NextResponse.json({ error: "lineup must contain 5 unique players" }, { status: 400 });
  }
  const result = evaluateLineup(players, getCoefficients());
  after(() => bump(redis, "complete"));
  return NextResponse.json({ result, players });
}
