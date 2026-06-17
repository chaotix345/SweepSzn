import { NextResponse, after } from "next/server";
import { verifyTrace } from "@/lib/dailyVerify";
import { bpKeyOk, bpCode, gradeBlueprint, encBpScore, type BpRow } from "@/lib/blueprint";
import { isBpBoardEnabled, submitBpScore, removeBpEntry } from "@/lib/blueprintBoard";
import { getSession } from "@/lib/authServer";
import { cleanName } from "@/lib/clean";
import { encodeLineup } from "@/lib/share";
import { redis, rateLimit, ipOf } from "@/lib/redis";
import { bump } from "@/lib/evServer";
import { dayUTC } from "@/lib/day";
import { engineDeps } from "@/lib/verifyDeps";

export const runtime = "nodejs";

// Blueprint daily submit: replay the trace against the shared bp-<date> seed (same anti-cheat
// core as the Daily), then grade the DECLARED blueprint against the verified result server-side.
// The server grades whatever blueprint the submit declares: boards are stratified per blueprint,
// so declaring after the fact is mathematically identical to the spec-sanctioned "power users
// replay all five blueprints on one seed" — the modal commitment is gameplay psychology, not a
// server invariant. The engine result is never modified; the multiplier lives in the board score.

const UID_RE = /^[a-z0-9-]{8,64}$/i;

const deps = engineDeps();

export async function POST(req: Request) {
  if (!isBpBoardEnabled()) return NextResponse.json({ error: "leaderboard not configured" }, { status: 503 });
  if (!(await rateLimit(`rl:bpsubmit:${ipOf(req)}`, 20, 60))) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }
  const body = (await req.json().catch(() => ({}))) ?? {};
  const { date, trace, blueprint } = body;
  if (date !== dayUTC()) return NextResponse.json({ error: "stale date" }, { status: 400 });
  if (!bpKeyOk(blueprint)) return NextResponse.json({ error: "bad blueprint" }, { status: 400 });

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

  const v = verifyTrace(`bp-${date}`, trace, deps);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  if (session?.anon && session.anon !== uid) {
    await removeBpEntry(date, session.anon);
  }

  const bp = gradeBlueprint(blueprint, v.result);
  const sortScore = encBpScore(v.result.wins, bp.mult, v.result.netRtg);
  const row: BpRow = {
    uid, name,
    wins: v.result.wins, losses: v.result.losses, net: v.result.netRtg,
    lineup: encodeLineup(v.lineup.split(","), body.usedHints === true, false, bpCode(blueprint)),
    bp: blueprint, grade: bp.grade, score: bp.score,
  };
  const view = await submitBpScore(date, row, sortScore);
  after(() => bump(redis, "submit", { uid, mode: "blueprint" }));
  return NextResponse.json(view);
}
