import { NextResponse } from "next/server";
import { spinPool, getPlayersByIds, getCoefficients } from "@/lib/data";
import { evaluateLineup } from "@/lib/engine";
import { verifyTrace, type VerifyDeps } from "@/lib/dailyVerify";
import { isChallengeEnabled, submitChallenge } from "@/lib/challengeStore";
import { challengeSeed, compareResults } from "@/lib/challenge";
import { decodeLineup } from "@/lib/share";
import { SLOTS } from "@/lib/teams";
import type { ChallengeMiniPlayer, ChallengeSubmitResponse } from "@/lib/types";

const cleanName = (s: unknown) => (typeof s === "string" ? s.trim().slice(0, 24) : "") || "Anonymous";

const deps: VerifyDeps = {
  spinPool,
  getPlayer: (id) => getPlayersByIds([id])[0],
  evaluate: (players) => evaluateLineup(players, getCoefficients()),
};

export async function POST(req: Request) {
  if (!isChallengeEnabled()) return NextResponse.json({ error: "challenges not configured" }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  const { id, uid, name, trace } = body ?? {};
  if (typeof id !== "string" || !/^[a-z0-9]{6,16}$/.test(id)) return NextResponse.json({ error: "bad challenge id" }, { status: 400 });
  if (typeof uid !== "string" || !/^[a-z0-9-]{8,64}$/i.test(uid)) return NextResponse.json({ error: "bad uid" }, { status: 400 });

  const v = verifyTrace(challengeSeed(id), trace, deps);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const row = { uid, name: cleanName(name), wins: v.result.wins, losses: v.result.losses, net: v.result.netRtg, lineup: v.lineup };
  const out = await submitChallenge(id, row, v.result, v.result.grade);
  if (!out) return NextResponse.json({ error: "challenges not configured" }, { status: 503 });

  if (out.role === "creator") {
    const res: ChallengeSubmitResponse = { role: "creator", id, board: out.board };
    return NextResponse.json(res);
  }

  // responder: resolve the creator's five (revealed now that this uid has submitted) + verdict
  const cmp = compareResults(
    { wins: v.result.wins, netRtg: v.result.netRtg },
    { wins: out.creator.wins, netRtg: out.creator.net },
  );
  const players: ChallengeMiniPlayer[] = getPlayersByIds(decodeLineup(out.creator.lineup))
    .map((p, i) => ({ id: p.id, name: p.name, team: p.team, decade: p.decade, slot: SLOTS[i] }));
  const res: ChallengeSubmitResponse = {
    role: "responder", id,
    creator: { name: out.creator.name, wins: out.creator.wins, losses: out.creator.losses, net: out.creator.net, grade: out.creator.grade, lineup: out.creator.lineup, players },
    verdict: { outcome: cmp.winner === "a" ? "win" : cmp.winner === "b" ? "loss" : "tie", winsMargin: cmp.winsMargin, netMargin: Math.round(cmp.netMargin * 10) / 10 },
    board: out.board,
  };
  return NextResponse.json(res);
}
