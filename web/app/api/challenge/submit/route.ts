import { NextResponse, after } from "next/server";
import { spinPool, getPlayersByIds, getCoefficients } from "@/lib/data";
import { evaluateLineup } from "@/lib/engine";
import { verifyTrace, type VerifyDeps } from "@/lib/dailyVerify";
import { isChallengeEnabled, submitChallenge, getChallengeSeed } from "@/lib/challengeStore";
import { compareResults, challengeSeed } from "@/lib/challenge";
import { decodeLineup, encodeLineup } from "@/lib/share";
import { cleanName } from "@/lib/clean";
import { getSession } from "@/lib/authServer";
import { SLOTS } from "@/lib/teams";
import { redis, rateLimit, ipOf } from "@/lib/redis";
import { bump } from "@/lib/evServer";
import { buildChallengeNotification } from "@/lib/notify";
import { enqueueNotif } from "@/lib/notifyStore";
import { sendPushToUid } from "@/lib/pushStore";
import type { ChallengeMiniPlayer, ChallengeSubmitResponse } from "@/lib/types";

export const runtime = "nodejs";

const UID_RE = /^[a-z0-9-]{8,64}$/i;
const ID_RE = /^[a-z0-9]{6,16}$/;
// A legitimate game seed the first submitter may convert into a challenge (carrying the original
// draft so a friend faces the SAME spins). Charset-bounded; the trace replay is the real gate.
// Only an ORIGINAL game seed may be converted. The legacy "Challenge a Friend" case (h2h-<id>) is
// NOT allowlisted here on purpose — the challengeSeed(id) fallback already produces the canonical
// h2h-<id>, so accepting a client h2h- seed would only let a creator point their challenge at a
// FOREIGN h2h-<otherid> pool (poisoning the draft). Excluding it closes that hole with no loss.
const isGameSeed = (s: unknown): s is string =>
  typeof s === "string" && /^[a-z0-9-]{1,40}$/.test(s) &&
  (s.startsWith("daily-") || s.startsWith("classic-") || s.startsWith("hoopiq-"));

export async function POST(req: Request) {
  if (!isChallengeEnabled()) return NextResponse.json({ error: "challenges not configured" }, { status: 503 });
  if (!(await rateLimit(`rl:chal:${ipOf(req)}`, 20, 60))) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  const { id, trace } = body ?? {};
  if (typeof id !== "string" || !ID_RE.test(id)) return NextResponse.json({ error: "bad challenge id" }, { status: 400 });

  // Identity: a valid session is authoritative (un-fakeable, so a signed-in player's board row can't
  // be overwritten by anyone replaying their uid). Anonymous players fall back to the client uid.
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

  // Resolve the draft seed. If the challenge already exists, its stored seed is authoritative (so a
  // responder is verified against the EXACT draft the creator faced, never a client-supplied one).
  // If it doesn't exist yet, the first submitter may convert a finished game by supplying its seed
  // (e.g. "daily-2026-6-9" or "classic-123"); otherwise it's a fresh "Challenge a Friend" (h2h-<id>).
  const stored = await getChallengeSeed(id);
  const seed = stored ?? (isGameSeed(body.seed) ? body.seed : challengeSeed(id));
  const v = verifyTrace(seed, trace, deps());
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const row = { uid, name, wins: v.result.wins, losses: v.result.losses, net: v.result.netRtg, lineup: v.lineup };
  // `hinted` is recorded only when this submit creates the challenge (so the bar discloses whether
  // the creator drafted with hints); it's ignored by submitChallenge for an already-claimed challenge.
  const out = await submitChallenge(id, row, v.result, v.result.grade, { seed, hinted: !stored && body.usedHints === true });
  if (!out) return NextResponse.json({ error: "challenges not configured" }, { status: 503 });
  after(() => bump(redis, "submit", { uid }));

  if (out.role === "creator") {
    const res: ChallengeSubmitResponse = { role: "creator", id, board: out.board };
    return NextResponse.json(res);
  }

  // responder: resolve the creator's five (revealed now that this uid has submitted) + verdict
  const cmp = compareResults(
    { wins: v.result.wins, netRtg: v.result.netRtg },
    { wins: out.creator.wins, netRtg: out.creator.net },
  );

  // Flagship re-engagement: when a responder posts a NEW personal best, ping the creator so they come
  // back ("Sam beat your 72-10 — reclaim it"). Notifying only on `improved` avoids spamming the creator
  // on worse retries. Runs post-response + error-swallowing (after()), so it can NEVER break the submit;
  // both the in-app inbox write and the web push self-disable when their deps are absent.
  if (out.improved) {
    const outcome = cmp.winner === "a" ? "beaten" : cmp.winner === "b" ? "held" : "tied";
    const creatorUid = out.creator.uid;
    const notif = buildChallengeNotification({
      challengeId: id, opponent: name, outcome,
      // only "took #1" when the creator was actually beaten AND the responder now leads the board —
      // a board-rank of 1 on a "held"/"tied" submit (from prior responders) would be incoherent.
      tookLead: outcome === "beaten" && out.board.you?.rank === 1,
      oppWins: v.result.wins, oppLosses: v.result.losses,
      yourWins: out.creator.wins, yourLosses: out.creator.losses,
      ts: Date.now(),
    });
    after(async () => { await enqueueNotif(creatorUid, notif); await sendPushToUid(creatorUid, notif); });
  }

  const creatorIds = decodeLineup(out.creator.lineup);
  // resolve by index so the slot label stays correct even if a stored id went stale (data update)
  const players: ChallengeMiniPlayer[] = creatorIds
    .map((cid, i) => { const p = getPlayersByIds([cid])[0]; return p ? { id: p.id, name: p.name, team: p.team, decade: p.decade, slot: SLOTS[i] } : null; })
    .filter((p): p is ChallengeMiniPlayer => !!p);
  const res: ChallengeSubmitResponse = {
    role: "responder", id,
    creator: {
      name: out.creator.name, wins: out.creator.wins, losses: out.creator.losses, net: out.creator.net,
      grade: out.creator.grade, hinted: !!out.creator.hinted,
      creatorResultUrl: `/r/${encodeLineup(creatorIds, !!out.creator.hinted)}`, players,
    },
    verdict: { outcome: cmp.winner === "a" ? "win" : cmp.winner === "b" ? "loss" : "tie", winsMargin: cmp.winsMargin, netMargin: Math.round(cmp.netMargin * 10) / 10 },
    board: out.board,
  };
  return NextResponse.json(res);
}

function deps(): VerifyDeps {
  return {
    spinPool,
    getPlayer: (id) => getPlayersByIds([id])[0],
    evaluate: (players) => evaluateLineup(players, getCoefficients()),
  };
}
