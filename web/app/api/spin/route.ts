import { NextResponse } from "next/server";
import { spin, primeSpin, duelSpin, type SpinOptions } from "@/lib/data";
import { isDuelSeed } from "@/lib/duel";
import { SLOTS } from "@/lib/teams";
import type { Slot } from "@/lib/types";
import { rateLimit, ipOf } from "@/lib/redis";
import { isFitLockedSeed } from "@/lib/challengeStore";
import { isFitLockableSeed } from "@/lib/challenge";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!(await rateLimit(`rl:spin:${ipOf(req)}`, 120, 60))) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  const seed: string = typeof body?.seed === "string" ? body.seed : "classic";
  const round: number = Number.isFinite(body?.round) ? body.round : 0;
  // Cap + sanitize the exclude list: a real game excludes at most 4 prior picks (the client sends its
  // drafted players, ≤4 before the last spin). Bounding it keeps a crafted huge array off the
  // CPU-heavy fit path, and a 5th+ id would push computeFits past a five-man lineup.
  // Draft Duel is the one exception: both sides' picks are excluded, so its last spin carries 9. Duel
  // spins never compute fit (duelSpin has no fit path), so the longer list can't reach computeFits.
  const duel = isDuelSeed(seed);
  const exclude: string[] = (Array.isArray(body?.exclude) ? body.exclude : [])
    .filter((x: unknown): x is string => typeof x === "string" && x.length <= 64)
    .slice(0, duel ? 9 : 4);
  if (duel) {
    // `open` = the asking side's open slots; the deal re-routes to a fallback spin if none of them fit
    const open = (Array.isArray(body?.open) ? body.open : []).filter((s: unknown): s is Slot => typeof s === "string" && SLOTS.includes(s as Slot));
    const r = Number.isInteger(round) ? Math.max(0, Math.min(4, round)) : 0;
    const asOf = typeof body?.asOf === "string" ? body.asOf : undefined;
    return NextResponse.json(duelSpin(seed, r, exclude, open.length ? [...new Set<Slot>(open)] : [...SLOTS], asOf));
  }
  // Fit grades are a Classic-only UI assist; only Classic free-play requests them (see lib/data.ts).
  // Refuse fit for a classic seed that's been converted into a challenge — its seed is exposed to
  // responders, so a crafted fit:true spin must not hand them optimal-draft grades over the creator.
  let wantFit = body?.fit === true;
  if (wantFit && isFitLockableSeed(seed) && await isFitLockedSeed(seed)) wantFit = false;
  const opts: SpinOptions = {
    exclude,
    lockedTeam: typeof body?.lockedTeam === "string" ? body.lockedTeam : null,
    lockedDecade: typeof body?.lockedDecade === "string" ? body.lockedDecade : null,
    excludeTeam: typeof body?.excludeTeam === "string" ? body.excludeTeam : null,
    excludeDecade: typeof body?.excludeDecade === "string" ? body.excludeDecade : null,
    salt: Number.isFinite(body?.salt) ? body.salt : 0,
    // the game's pinned pool date; ignored for dated seeds, clamped to today (lib/poolDate.ts)
    asOf: typeof body?.asOf === "string" ? body.asOf : undefined,
  };
  // Prime Draft seeds spin team-only over all-time peak-variant pools (era locked to PRIME)
  if (seed.startsWith("prime-")) return NextResponse.json(primeSpin(seed, round, opts, wantFit));
  return NextResponse.json(spin(seed, round, opts, wantFit));
}
