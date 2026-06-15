import { NextResponse } from "next/server";
import { isLeaderboardEnabled } from "@/lib/leaderboard";
import { getAggBoard } from "@/lib/aggBoard";
import { getSession } from "@/lib/authServer";
import { isoWeek } from "@/lib/isoweek";
import { PRIVATE_NO_STORE } from "@/lib/boardCache";
import { dayUTC } from "@/lib/day";

export const runtime = "nodejs";

// Sign-in gated: the weekly board is a signed-in-only feature now. The session uid is authoritative
// for the "you" highlight (un-spoofable), so no ?uid= query is read here.
export async function GET(req: Request) {
  if (!isLeaderboardEnabled()) return NextResponse.json({ error: "leaderboard not configured" }, { status: 503 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "auth_required" }, { status: 401 });
  const week = new URL(req.url).searchParams.get("week") || isoWeek(dayUTC());
  if (!/^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/.test(week)) return NextResponse.json({ error: "bad week" }, { status: 400 });
  return NextResponse.json(await getAggBoard("week", session.uid, week), { headers: PRIVATE_NO_STORE });
}
