import { NextResponse } from "next/server";
import { isLeaderboardEnabled } from "@/lib/leaderboard";
import { getAggBoard } from "@/lib/aggBoard";
import { isoWeek } from "@/lib/isoweek";
import { BOARD_CACHE } from "@/lib/boardCache";
import { dayUTC } from "@/lib/day";

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!isLeaderboardEnabled()) return NextResponse.json({ error: "leaderboard not configured" }, { status: 503 });
  const u = new URL(req.url);
  const uid = u.searchParams.get("uid") ?? undefined;
  if (uid && !/^[a-z0-9-]{8,64}$/i.test(uid)) return NextResponse.json({ error: "bad uid" }, { status: 400 });
  const week = u.searchParams.get("week") || isoWeek(dayUTC());
  if (!/^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/.test(week)) return NextResponse.json({ error: "bad week" }, { status: 400 });
  return NextResponse.json(await getAggBoard("week", uid, week), { headers: BOARD_CACHE });
}
