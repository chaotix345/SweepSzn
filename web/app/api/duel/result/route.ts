import { NextResponse } from "next/server";
import { getCoefficients } from "@/lib/data";
import { evaluateLineup } from "@/lib/engine";
import { compareResults } from "@/lib/challenge";
import { rateLimit, ipOf } from "@/lib/redis";
import { SLOTS } from "@/lib/teams";
import type { Player } from "@/lib/types";
import { encodeDuelCard, isDuelSeed, isPersona, outcomeFromWinner } from "@/lib/duel";
import { parsePicks, replayDuel } from "@/lib/duelBot";

export const runtime = "nodejs";

// Draft Duel: score a finished duel. Replays the whole draft from (seed, persona, your five picks), so a
// player outside your deal or an illegal slot is rejected; then both fives run through the engine and
// the winner is decided by record, tiebreak net rating (compareResults). Stateless: Duel never writes
// to a board, a streak or Redis — the W-L record lives in the player's own result history.
export async function POST(req: Request) {
  if (!(await rateLimit(`rl:duelres:${ipOf(req)}`, 30, 60))) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  const picks = parsePicks(body?.picks);
  if (!isDuelSeed(body?.seed) || !isPersona(body?.persona) || !picks || picks.length !== 5) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const r = replayDuel(body.seed, body.persona, picks);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  if (r.next !== null) return NextResponse.json({ error: "duel not finished" }, { status: 400 });
  const c = getCoefficients();
  const youPlayers = SLOTS.map((s) => r.you[s]) as Player[];
  const botPlayers = SLOTS.map((s) => r.bot[s]) as Player[];
  const you = evaluateLineup(youPlayers, c);
  const bot = evaluateLineup(botPlayers, c);
  const outcome = outcomeFromWinner(compareResults(you, bot).winner);
  return NextResponse.json({
    persona: body.persona,
    outcome,
    card: encodeDuelCard(body.persona, youPlayers.map((p) => p.id), botPlayers.map((p) => p.id)),
    you: { players: youPlayers, result: you },
    bot: { players: botPlayers, result: bot },
  });
}
