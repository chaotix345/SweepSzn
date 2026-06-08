import { NextResponse } from "next/server";
import { isLeaderboardEnabled } from "@/lib/leaderboard";
import { getAggBoard } from "@/lib/aggBoard";
import { isoWeek } from "@/lib/isoweek";

export const runtime = "nodejs";
const todayUTC = () => { const d = new Date(); return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`; };

export async function GET(req: Request) {
  if (!isLeaderboardEnabled()) return NextResponse.json({ error: "leaderboard not configured" }, { status: 503 });
  const u = new URL(req.url);
  const uid = u.searchParams.get("uid") ?? undefined;
  const week = u.searchParams.get("week") || isoWeek(todayUTC());
  if (!/^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/.test(week)) return NextResponse.json({ error: "bad week" }, { status: 400 });
  return NextResponse.json(await getAggBoard("week", uid, week));
}
