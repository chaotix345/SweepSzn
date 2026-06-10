import { NextResponse } from "next/server";
import { isSurgeonBoardEnabled, getSurgeonLeaderboard } from "@/lib/surgeonBoard";
import { rateLimit, ipOf } from "@/lib/redis";
import { BOARD_CACHE } from "@/lib/boardCache";

export const runtime = "nodejs";

// Read the day's surgeon board: ?date=YYYY-M-D&uid=<optional>.
// Separate GET bucket from the submit POST so board polling can't starve submits.

const DATE_RE = /^\d{4}-\d{1,2}-\d{1,2}$/;
const UID_RE = /^[a-z0-9-]{8,64}$/i;

export async function GET(req: Request) {
  if (!isSurgeonBoardEnabled()) return NextResponse.json({ error: "leaderboard not configured" }, { status: 503 });
  if (!(await rateLimit(`rl:sgboard:${ipOf(req)}`, 60, 60))) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }
  const url = new URL(req.url);
  const date = url.searchParams.get("date") ?? "";
  const uidParam = url.searchParams.get("uid") ?? "";
  if (!DATE_RE.test(date)) return NextResponse.json({ error: "bad date" }, { status: 400 });
  const uid = UID_RE.test(uidParam) ? uidParam : undefined;
  const view = await getSurgeonLeaderboard(date, uid);
  return NextResponse.json(view, { headers: BOARD_CACHE });
}
