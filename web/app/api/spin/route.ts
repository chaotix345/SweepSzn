import { NextResponse } from "next/server";
import { spin, type SpinOptions } from "@/lib/data";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const seed: string = typeof body?.seed === "string" ? body.seed : "classic";
  const round: number = Number.isFinite(body?.round) ? body.round : 0;
  const opts: SpinOptions = {
    exclude: Array.isArray(body?.exclude) ? body.exclude : [],
    lockedTeam: typeof body?.lockedTeam === "string" ? body.lockedTeam : null,
    lockedDecade: typeof body?.lockedDecade === "string" ? body.lockedDecade : null,
    excludeTeam: typeof body?.excludeTeam === "string" ? body.excludeTeam : null,
    excludeDecade: typeof body?.excludeDecade === "string" ? body.excludeDecade : null,
    salt: Number.isFinite(body?.salt) ? body.salt : 0,
  };
  return NextResponse.json(spin(seed, round, opts));
}
