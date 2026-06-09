import { NextResponse } from "next/server";
import { spin, type SpinOptions } from "@/lib/data";
import { rateLimit, ipOf } from "@/lib/redis";
import { isFitLockedSeed } from "@/lib/challengeStore";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!(await rateLimit(`rl:spin:${ipOf(req)}`, 120, 60))) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  const seed: string = typeof body?.seed === "string" ? body.seed : "classic";
  const round: number = Number.isFinite(body?.round) ? body.round : 0;
  // Cap + sanitize the exclude list: a real game excludes at most 4 prior picks. Bounding it keeps
  // a crafted huge array off the CPU-heavy fit path and off Redis-free string churn.
  const exclude: string[] = (Array.isArray(body?.exclude) ? body.exclude : [])
    .filter((x: unknown): x is string => typeof x === "string" && x.length <= 64)
    .slice(0, 8);
  // Fit grades are a Classic-only UI assist; only Classic free-play requests them (see lib/data.ts).
  // Refuse fit for a classic seed that's been converted into a challenge — its seed is exposed to
  // responders, so a crafted fit:true spin must not hand them optimal-draft grades over the creator.
  let wantFit = body?.fit === true;
  if (wantFit && seed.startsWith("classic") && await isFitLockedSeed(seed)) wantFit = false;
  const opts: SpinOptions = {
    exclude,
    lockedTeam: typeof body?.lockedTeam === "string" ? body.lockedTeam : null,
    lockedDecade: typeof body?.lockedDecade === "string" ? body.lockedDecade : null,
    excludeTeam: typeof body?.excludeTeam === "string" ? body.excludeTeam : null,
    excludeDecade: typeof body?.excludeDecade === "string" ? body.excludeDecade : null,
    salt: Number.isFinite(body?.salt) ? body.salt : 0,
  };
  return NextResponse.json(spin(seed, round, opts, wantFit));
}
