import { NextResponse, after } from "next/server";
import { verifyTrace } from "@/lib/dailyVerify";
import { buildFhChoices, encFhScore, decodeFhDisplay, type FhRow } from "@/lib/factorHunt";
import { isFhBoardEnabled, submitFhScore, removeFhEntry, lockFhPrediction } from "@/lib/factorHuntBoard";
import { getSession } from "@/lib/authServer";
import { cleanName } from "@/lib/clean";
import { redis, rateLimit, ipOf } from "@/lib/redis";
import { bump } from "@/lib/evServer";
import { dayUTC } from "@/lib/day";
import { engineDeps } from "@/lib/verifyDeps";

export const runtime = "nodejs";

// Factor Hunt daily submit: replay the trace against the shared fh-<date> seed (same anti-cheat
// core as the Daily), rebuild the prediction choices server-side from the verified lineup, and
// apply the cosmetic ×1.05 ONLY when the locked prediction matches the recomputed answer. The
// engine result is never modified — the bonus lives in the board's sort score and display.

const UID_RE = /^[a-z0-9-]{8,64}$/i;

const deps = engineDeps();

export async function POST(req: Request) {
  if (!isFhBoardEnabled()) return NextResponse.json({ error: "leaderboard not configured" }, { status: 503 });
  if (!(await rateLimit(`rl:fhsubmit:${ipOf(req)}`, 20, 60))) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }
  const body = (await req.json().catch(() => ({}))) ?? {};
  const { date, trace } = body;
  if (date !== dayUTC()) return NextResponse.json({ error: "stale date" }, { status: 400 });

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

  const seed = `fh-${date}`;
  const v = verifyTrace(seed, trace, deps);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  if (session?.anon && session.anon !== uid) {
    await removeFhEntry(date, session.anon);
  }

  // The bonus is granted only when the submitted prediction is one of the seed's actual choices
  // AND matches the recomputed answer — a fabricated label earns nothing.
  const choices = buildFhChoices(v.result.factors, seed);
  const requested = choices && typeof body.prediction === "string" && choices.choices.includes(body.prediction)
    ? body.prediction
    : null;
  // First submission of this lineup locks the prediction (skips included) for the day; replays
  // of the same lineup are graded against the locked value, so the result card's revealed
  // breakdown can't be fed back through keep-best to retroactively earn the ×1.05.
  const locked = await lockFhPrediction(date, uid, v.lineup, requested);
  const predicted = locked && choices?.choices.includes(locked) ? locked : null;
  const correct = !!choices && !!predicted && predicted === choices.answer;
  const sortScore = encFhScore(v.result.wins, v.result.netRtg, correct);
  const row: FhRow = {
    uid, name,
    wins: v.result.wins, losses: v.result.losses, net: v.result.netRtg, lineup: v.lineup,
    predicted, correct, score: decodeFhDisplay(sortScore),
  };
  const view = await submitFhScore(date, row, sortScore);
  after(() => bump(redis, "submit", { uid, mode: "factorhunt" }));
  return NextResponse.json(view);
}
