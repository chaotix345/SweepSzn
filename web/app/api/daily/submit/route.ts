import { NextResponse } from "next/server";
import { spinPool, getPlayersByIds, getCoefficients } from "@/lib/data";
import { evaluateLineup } from "@/lib/engine";
import { verifyDaily, type VerifyDeps } from "@/lib/dailyVerify";
import { isLeaderboardEnabled, submitScore } from "@/lib/leaderboard";

const todayUTC = () => { const d = new Date(); return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`; };
// names render as text (React-escaped); just trim + cap length, default to Anonymous
const cleanName = (s: unknown) => (typeof s === "string" ? s.trim().slice(0, 24) : "") || "Anonymous";

const deps: VerifyDeps = {
  spinPool,
  getPlayer: (id) => getPlayersByIds([id])[0],
  evaluate: (players) => evaluateLineup(players, getCoefficients()),
};

export async function POST(req: Request) {
  if (!isLeaderboardEnabled()) return NextResponse.json({ error: "leaderboard not configured" }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  const { date, uid, name, trace } = body ?? {};
  if (date !== todayUTC()) return NextResponse.json({ error: "stale date" }, { status: 400 });
  if (typeof uid !== "string" || !/^[a-z0-9-]{8,64}$/i.test(uid)) return NextResponse.json({ error: "bad uid" }, { status: 400 });

  const v = verifyDaily(date, trace, deps);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const row = { uid, name: cleanName(name), wins: v.result.wins, losses: v.result.losses, net: v.result.netRtg, lineup: v.lineup };
  const view = await submitScore(date, row, v.result);
  return NextResponse.json(view);
}
