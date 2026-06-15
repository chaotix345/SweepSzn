import { NextResponse } from "next/server";
import { isLeaderboardEnabled } from "@/lib/leaderboard";
import { getAggBoard } from "@/lib/aggBoard";
import { getSession } from "@/lib/authServer";
import { PRIVATE_NO_STORE } from "@/lib/boardCache";

export const runtime = "nodejs";

// Sign-in gated (see weekly): the all-time board requires an account; session uid is the "you" key.
export async function GET() {
  if (!isLeaderboardEnabled()) return NextResponse.json({ error: "leaderboard not configured" }, { status: 503 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "auth_required" }, { status: 401 });
  return NextResponse.json(await getAggBoard("alltime", session.uid), { headers: PRIVATE_NO_STORE });
}
