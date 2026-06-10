import { NextResponse, after } from "next/server";
import { spinPool, getPlayersByIds, getCoefficients } from "@/lib/data";
import { evaluateLineup } from "@/lib/engine";
import { verifyTrace, type VerifyDeps } from "@/lib/dailyVerify";
import {
  surgeonSeedOk, surgeonDiagnosis, needOf, buildSurgeonPool,
  encSurgeonScore, encodeSurgeonCard, type SurgeonRow,
} from "@/lib/surgeon";
import { submitSurgeonScore, lockSurgeonSwap, removeSurgeonEntry } from "@/lib/surgeonBoard";
import { getSession } from "@/lib/authServer";
import { cleanName } from "@/lib/clean";
import { SLOTS } from "@/lib/teams";
import type { Player } from "@/lib/types";
import { redis, rateLimit, ipOf } from "@/lib/redis";
import { bump } from "@/lib/evServer";

export const runtime = "nodejs";

// Surgeon submit — the reveal IS the submit (Factor Hunt lesson, carried forward): the client
// sends its trace + the chosen swap, and the server (1) replays the trace, (2) recomputes the
// diagnosis AND the three-candidate pool from the verified lineup, (3) rejects any swap not in
// that recomputed pool, (4) write-once locks the swap per uid+date+lineup (SET NX — with only
// 3 candidates × 5 targets, unlimited resubmits would brute-force the optimum through
// keep-best), and (5) recomputes the delta itself. Client-sent factors, pools, and deltas are
// never trusted — they are never even read.

const todayUTC = () => { const d = new Date(); return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`; };
const UID_RE = /^[a-z0-9-]{8,64}$/i;
const ID_RE = /^[a-z0-9_]{1,64}$/;

export async function POST(req: Request) {
  // No Redis guard here: Surgeon's reveal (before/after/delta) is the submit's RESPONSE — gating it
  // would make the mode unplayable without Redis, unlike Classic/Blueprint which reveal via
  // /api/evaluate. Only the Redis-dependent parts self-disable: lockSurgeonSwap returns the
  // requested swap unlocked (no board = no brute-force incentive) and submitSurgeonScore returns a
  // null view, which the board UI renders as "Board opens soon". The leaderboard GET still 503s.
  if (!(await rateLimit(`rl:sgsubmit:${ipOf(req)}`, 20, 60))) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }
  const body = (await req.json().catch(() => ({}))) ?? {};
  const { date, trace } = body;
  if (date !== todayUTC()) return NextResponse.json({ error: "stale date" }, { status: 400 });
  if (typeof body.outId !== "string" || !ID_RE.test(body.outId) || typeof body.inId !== "string" || !ID_RE.test(body.inId)) {
    return NextResponse.json({ error: "bad swap" }, { status: 400 });
  }

  const session = await getSession();
  let uid: string, name: string;
  if (session) {
    uid = session.uid;
    name = cleanName(body.name) || session.name || "Player";
  } else {
    if (typeof body.uid !== "string" || !UID_RE.test(body.uid)) return NextResponse.json({ error: "bad uid" }, { status: 400 });
    uid = body.uid;
    name = cleanName(body.name) || "Anonymous";
  }

  const seed = `surgeon-${date}`;
  if (!surgeonSeedOk(seed)) return NextResponse.json({ error: "bad seed" }, { status: 400 });
  const pools: string[][] = [];
  const deps: VerifyDeps = {
    spinPool: (s, round, opts) => {
      const r = spinPool(s, round, opts);
      pools[round] = r.ids;
      return r;
    },
    getPlayer: (id) => getPlayersByIds([id])[0],
    evaluate: (players) => evaluateLineup(players, getCoefficients()),
  };
  const v = verifyTrace(seed, trace, deps);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  // recompute the deal from the verified lineup — the only pool a swap may come from
  const diagnosis = surgeonDiagnosis(v.result.factors);
  if (!diagnosis) return NextResponse.json({ error: "no factors" }, { status: 422 });
  const offered = getPlayersByIds([...new Set(pools.flat())]);
  const candidates = buildSurgeonPool(v.players, offered, needOf(diagnosis.canonical));

  // Validate the REQUESTED swap BEFORE consuming the one-time lock. An invalid swap (off-pool,
  // ineligible for the vacated slot, or a duplicate person) must NOT be written, or it would
  // permanently brick this lineup: every retry would grade the locked-but-invalid swap and 400.
  // Only a legal swap is worth a lock.
  const validate = (outId: string, inId: string):
    | { ok: true; outIdx: number; inPlayer: Player } | { ok: false; error: string } => {
    const outIdx = v.players.findIndex((p) => p.id === outId);
    if (outIdx === -1) return { ok: false, error: "out player not in lineup" };
    const cand = candidates.find((c) => c.id === inId);
    if (!cand) return { ok: false, error: "swap not in the dealt pool" };
    if (!cand.eligible.includes(SLOTS[outIdx])) return { ok: false, error: "ineligible swap" };
    const inPlayer = getPlayersByIds([inId])[0];
    if (!inPlayer) return { ok: false, error: "unknown player" };
    if (v.players.some((p, i) => i !== outIdx && (p.person_id ?? p.id) === (inPlayer.person_id ?? inPlayer.id))) {
      return { ok: false, error: "duplicate player" };
    }
    return { ok: true, outIdx, inPlayer };
  };
  const reqCheck = validate(body.outId, body.inId);
  if (!reqCheck.ok) return NextResponse.json({ error: reqCheck.error }, { status: 400 });

  // now consume the write-once lock; a replay of this lineup grades the LOCKED swap, not the retry
  const swap = await lockSurgeonSwap(date, uid, v.lineup, { outId: body.outId, inId: body.inId });
  // the locked swap was validated when first written, but re-check defensively before grading
  const check = validate(swap.outId, swap.inId);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
  const { outIdx, inPlayer } = check;

  const afterPlayers = v.players.map((p, i) => (i === outIdx ? inPlayer : p));
  const afterResult = evaluateLineup(afterPlayers, getCoefficients());
  const delta = afterResult.wins - v.result.wins;

  const card = encodeSurgeonCard(v.players.map((p) => p.id), outIdx, swap.inId);
  const sortScore = encSurgeonScore(delta, afterResult.netRtg);
  const row: SurgeonRow = {
    uid, name, delta,
    beforeWins: v.result.wins, afterWins: afterResult.wins, net: afterResult.netRtg, card,
  };
  // Claim cleanup only now that this submit is definitely landing a row — running it earlier
  // would let a FAILED submit (bad swap) silently delete the player's anon score (mirrors daily).
  if (session?.anon && session.anon !== uid) {
    await removeSurgeonEntry(date, session.anon);
  }
  const view = await submitSurgeonScore(date, row, sortScore);
  after(() => bump(redis, "submit", { uid }));
  // the locked swap is echoed so a replayed lineup renders ITS result, not the requested retry
  return NextResponse.json({
    view, delta, card, swap,
    diagnosis,
    before: v.result, beforePlayers: v.players,
    after: afterResult, afterPlayers,
  });
}
