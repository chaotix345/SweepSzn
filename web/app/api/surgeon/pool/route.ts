import { NextResponse } from "next/server";
import { getPlayersByIds } from "@/lib/data";
import { verifyTrace } from "@/lib/dailyVerify";
import { surgeonSeedOk, surgeonDiagnosis, needOf, buildSurgeonPool } from "@/lib/surgeon";
import { rateLimit, ipOf } from "@/lib/redis";
import { dayUTC } from "@/lib/day";
import { engineDeps } from "@/lib/verifyDeps";

export const runtime = "nodejs";

// Phase 2 deal: replay the submitted trace against the shared surgeon-<date> seed (anti-cheat
// replay — a fabricated trace gets nothing), diagnose the worst factor, and deal the targeted
// replacement pool from the players those verified spins actually offered. Returns the BEFORE
// record + diagnosis + the three candidates with WHY each was offered — but never any
// after-swap value: the delta is only revealed by the submit, which locks the swap first.
//
// Intentionally NO isSurgeonBoardEnabled() gate (mirrors the submit route): the deal is part of
// playing, so a Redis-absent deploy must still serve it — only board writes self-disable.
// Intentionally no pre-deal lock either: per the trust model (DESIGN.md §12), a patient player
// can compute swap outcomes offline anyway (open engine + public data + /api/evaluate); the
// per-lineup swap lock at submit plus the daily case cap are the real anti-shopping guards, and
// the 60/min IP limit here bounds the verifyTrace+evaluate CPU this route can be made to burn.

export async function POST(req: Request) {
  if (!(await rateLimit(`rl:sgpool:${ipOf(req)}`, 60, 60))) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  if (!surgeonSeedOk(body?.seed)) return NextResponse.json({ error: "bad seed" }, { status: 400 });
  // today only: the deal (diagnosis + targeted pool) is the day's puzzle — no pre-fetching
  // tomorrow's case; a midnight-straddling game fails here with the same error the submit
  // would have given it anyway
  if (body.seed !== `surgeon-${dayUTC()}`) {
    return NextResponse.json({ error: "stale date" }, { status: 400 });
  }

  // collect each round's FINAL pool (post-respins) through the injected deps — the exact
  // rosters the player drafted from, reproduced identically at submit time
  const pools: string[][] = [];
  const deps = engineDeps((round, ids) => { pools[round] = ids; });
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
