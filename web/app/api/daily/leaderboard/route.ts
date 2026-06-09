import { NextResponse } from "next/server";
import { isLeaderboardEnabled, getLeaderboard } from "@/lib/leaderboard";

export async function GET(req: Request) {
  if (!isLeaderboardEnabled()) return NextResponse.json({ error: "leaderboard not configured" }, { status: 503 });
  const u = new URL(req.url);
  const date = u.searchParams.get("date");
  const uid = u.searchParams.get("uid") ?? undefined;
  if (!date || !/^\d{4}-\d{1,2}-\d{1,2}$/.test(date)) return NextResponse.json({ error: "bad date" }, { status: 400 });
  // bound the uid before it reaches Redis as an HGET field (an unvalidated giant string is an egress/DoS vector)
  if (uid && !/^[a-z0-9-]{8,64}$/i.test(uid)) return NextResponse.json({ error: "bad uid" }, { status: 400 });
  return NextResponse.json(await getLeaderboard(date, uid));
}
