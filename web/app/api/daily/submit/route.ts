import { NextResponse, after } from "next/server";
import { verifyDaily } from "@/lib/dailyVerify";
import { isLeaderboardEnabled, submitScore, submitScoreAuthed, removeEntry } from "@/lib/leaderboard";
import { getSession } from "@/lib/authServer";
import { recordStreakDate } from "@/lib/profileStore";
import { encodeLineup } from "@/lib/share";
import { cleanName } from "@/lib/clean";
import { redis, rateLimit, ipOf } from "@/lib/redis";
import { bump } from "@/lib/evServer";
import { dayUTC } from "@/lib/day";
import { engineDeps } from "@/lib/verifyDeps";

export const runtime = "nodejs";

const UID_RE = /^[a-z0-9-]{8,64}$/i;

const deps = engineDeps();

export async function POST(req: Request) {
  if (!isLeaderboardEnabled()) return NextResponse.json({ error: "leaderboard not configured" }, { status: 503 });
  if (!(await rateLimit(`rl:daily:${ipOf(req)}`, 20, 60))) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }
  const body = (await req.json().catch(() => ({}))) ?? {};
  const { date, trace } = body;
  if (date !== dayUTC()) return NextResponse.json({ error: "stale date" }, { status: 400 });

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

  // Carry the hint stamp into the stored permalink so a leaderboard-row → /r/ link keeps the
  // "HINTS used" badge (the in-game share already encodes it; this matches that path).
  const lineup = encodeLineup(v.lineup.split(","), body.usedHints === true);
  const row = { uid, name, wins: v.result.wins, losses: v.result.losses, net: v.result.netRtg, lineup };
  // signed-in: daily keep-best + credit wins to weekly/all-time. anon: daily only.
  const view = session
    ? await submitScoreAuthed(date, row, v.result)
    : await submitScore(date, row, v.result);
  // Server-authoritative streak (signed-in only): completing today's verified daily records the
  // day under the account, so the streak survives across devices and beyond the daily board's TTL.
  if (session) await recordStreakDate(uid, date, Date.now());
  after(() => bump(redis, "submit", { uid, mode: "daily" }));
  return NextResponse.json(view);
}
