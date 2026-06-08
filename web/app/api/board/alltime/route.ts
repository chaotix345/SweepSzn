import { NextResponse } from "next/server";
import { isLeaderboardEnabled } from "@/lib/leaderboard";
import { getAggBoard } from "@/lib/aggBoard";

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!isLeaderboardEnabled()) return NextResponse.json({ error: "leaderboard not configured" }, { status: 503 });
  const uid = new URL(req.url).searchParams.get("uid") ?? undefined;
  return NextResponse.json(await getAggBoard("alltime", uid));
}
