import { NextResponse } from "next/server";
import { getCoefficients, toCandidate } from "@/lib/data";
import { playerFeatures } from "@/lib/engine";
import { rateLimit, ipOf } from "@/lib/redis";
import { isDuelSeed, isPersona } from "@/lib/duel";
import { parsePicks, replayDuel } from "@/lib/duelBot";

export const runtime = "nodejs";

// Draft Duel: advance the bot. The client sends only the seed, the persona and its own picks; the server
// rebuilds the duel (validating every pick against its deal) and plays every bot turn up to the
// player's next one. Only the bot's finished picks go back — never a per-candidate score (§12).
export async function POST(req: Request) {
  if (!(await rateLimit(`rl:duel:${ipOf(req)}`, 120, 60))) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  const picks = parsePicks(body?.picks);
  if (!isDuelSeed(body?.seed) || !isPersona(body?.persona) || !picks) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const r = replayDuel(body.seed, body.persona, picks, body?.asOf);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  const c = getCoefficients();
  const bot = r.turns.filter((t) => t.side === "bot").map((t) => ({
    turn: t.turn, round: t.round, slot: t.slot, team: t.team, decade: t.decade, fallback: t.fallback,
    player: toCandidate(t.player, undefined, playerFeatures(t.player, c).usage),
  }));
  return NextResponse.json({ bot, next: r.next });
}
