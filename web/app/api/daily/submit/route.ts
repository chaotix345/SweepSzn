import { NextResponse, after } from "next/server";
import { spinPool, getPlayersByIds, getCoefficients } from "@/lib/data";
import { evaluateLineup } from "@/lib/engine";
import { verifyDaily, type VerifyDeps } from "@/lib/dailyVerify";
import { isLeaderboardEnabled, submitScore, submitScoreAuthed, removeEntry } from "@/lib/leaderboard";
import { getSession } from "@/lib/authServer";
import { redis } from "@/lib/redis";
import { bump } from "@/lib/evServer";

export const runtime = "nodejs";

const todayUTC = () => { const d = new Date(); return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`; };
const UID_RE = /^[a-z0-9-]{8,64}$/i;
const cleanName = (s: unknown) => (typeof s === "string" ? s.trim().slice(0, 24) : "");

const deps: VerifyDeps = {
  spinPool,
  getPlayer: (id) => getPlayersByIds([id])[0],
  evaluate: (players) => evaluateLineup(players, getCoefficients()),
};

export async function POST(req: Request) {
  if (!isLeaderboardEnabled()) return NextResponse.json({ error: "leaderboard not configured" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) ?? {};
  const { date, trace } = body;
  if (date !== todayUTC()) return NextResponse.json({ error: "stale date" }, { status: 400 });

  // Identity: a valid session is authoritative (un-fakeable); otherwise fall back to the anon uid.
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

  const v = verifyDaily(date, trace, deps);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  // Claim cleanup BEFORE computing the view (so rank/total aren't inflated by the dupe).
  // Only the anon uid bound into the session at sign-in is removable — never a client-supplied
  // uid — so a signed-in user can't delete another player's row.
  if (session?.anon && session.anon !== uid) {
    await removeEntry(date, session.anon);
  }

  const row = { uid, name, wins: v.result.wins, losses: v.result.losses, net: v.result.netRtg, lineup: v.lineup };
  // signed-in: daily keep-best + credit wins to weekly/all-time. anon: daily only.
  const view = session
    ? await submitScoreAuthed(date, row, v.result)
    : await submitScore(date, row, v.result);
  after(() => bump(redis, "submit", { uid }));
  return NextResponse.json(view);
}
