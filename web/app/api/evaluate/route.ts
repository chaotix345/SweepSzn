import { NextResponse } from "next/server";
import { getPlayersByIds, getCoefficients } from "@/lib/data";
import { evaluateLineup } from "@/lib/engine";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter((x: unknown) => typeof x === "string") : [];
  if (ids.length !== 5) return NextResponse.json({ error: "exactly 5 players required" }, { status: 400 });
  const players = getPlayersByIds(ids);
  const result = evaluateLineup(players, getCoefficients());
  return NextResponse.json({ result, players });
}
