import { NextResponse } from "next/server";
import { spinPool, getPlayersByIds, getCoefficients } from "@/lib/data";
import { evaluateLineup } from "@/lib/engine";
import { verifyTrace, type VerifyDeps } from "@/lib/dailyVerify";
import { surgeonSeedOk, surgeonDiagnosis, needOf, buildSurgeonPool } from "@/lib/surgeon";
import { rateLimit, ipOf } from "@/lib/redis";

export const runtime = "nodejs";

// Phase 2 deal: replay the submitted trace against the shared surgeon-<date> seed (anti-cheat
// replay — a fabricated trace gets nothing), diagnose the worst factor, and deal the targeted
// replacement pool from the players those verified spins actually offered. Returns the BEFORE
// record + diagnosis + the three candidates with WHY each was offered — but never any
// after-swap value: the delta is only revealed by the submit, which locks the swap first.

export async function POST(req: Request) {
  if (!(await rateLimit(`rl:sgpool:${ipOf(req)}`, 60, 60))) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  if (!surgeonSeedOk(body?.seed)) return NextResponse.json({ error: "bad seed" }, { status: 400 });

  // collect each round's FINAL pool (post-respins) through the injected deps — the exact
  // rosters the player drafted from, reproduced identically at submit time
  const pools: string[][] = [];
  const deps: VerifyDeps = {
    spinPool: (seed, round, opts) => {
      const r = spinPool(seed, round, opts);
      pools[round] = r.ids;
      return r;
    },
    getPlayer: (id) => getPlayersByIds([id])[0],
    evaluate: (players) => evaluateLineup(players, getCoefficients()),
  };
  const v = verifyTrace(body.seed, body.trace, deps);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const diagnosis = surgeonDiagnosis(v.result.factors);
  if (!diagnosis) return NextResponse.json({ error: "no factors" }, { status: 422 });
  const offered = getPlayersByIds([...new Set(pools.flat())]);
  const candidates = buildSurgeonPool(v.players, offered, needOf(diagnosis.canonical));
  if (candidates.length === 0) return NextResponse.json({ error: "no candidates" }, { status: 422 });

  return NextResponse.json({
    diagnosis,
    before: { wins: v.result.wins, losses: v.result.losses, net: v.result.netRtg, grade: v.result.grade },
    candidates,
  });
}
