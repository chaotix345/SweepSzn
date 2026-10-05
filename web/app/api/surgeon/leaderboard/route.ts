import { NextResponse } from "next/server";
import { isSurgeonBoardEnabled, getSurgeonLeaderboard } from "@/lib/surgeonBoard";
import { rateLimit, ipOf } from "@/lib/redis";
import { BOARD_CACHE, PRIVATE_NO_STORE } from "@/lib/boardCache";
import { getSession } from "@/lib/authServer";
import { isAnonUid } from "@/lib/auth";

export const runtime = "nodejs";

// Read the day's surgeon board: GET ?date=YYYY-M-D (public), POST {date, uid} (personalized).
// Separate bucket from the submit POST so board polling can't starve submits.

const DATE_RE = /^\d{4}-\d{1,2}-\d{1,2}$/;
const limited = async (req: Request) => !(await rateLimit(`rl:sgboard:${ipOf(req)}`, 60, 60));

// Public, un-personalized read (CDN-cached). Any uid query param is IGNORED — the bearer anon uid must
// never ride a URL (DESIGN.md §12); personalized reads POST it (mirrors daily/leaderboard).
export async function GET(req: Request) {
  if (!isSurgeonBoardEnabled()) return NextResponse.json({ error: "leaderboard not configured" }, { status: 503 });
  if (await limited(req)) return NextResponse.json({ error: "too many requests" }, { status: 429 });
  const date = new URL(req.url).searchParams.get("date") ?? "";
  if (!DATE_RE.test(date)) return NextResponse.json({ error: "bad date" }, { status: 400 });
  const view = await getSurgeonLeaderboard(date);
  return NextResponse.json(view, { headers: BOARD_CACHE });
}

// Personalized read ("you" + `me`): uid in the POST body, never cached; a session wins over the body uid.
export async function POST(req: Request) {
  if (!isSurgeonBoardEnabled()) return NextResponse.json({ error: "leaderboard not configured" }, { status: 503 });
  if (await limited(req)) return NextResponse.json({ error: "too many requests" }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) ?? {};
  if (typeof body.date !== "string" || !DATE_RE.test(body.date)) return NextResponse.json({ error: "bad date" }, { status: 400 });
  const uid = (await getSession())?.uid ?? (isAnonUid(body.uid) ? body.uid : null);
  if (!uid) return NextResponse.json({ error: "bad uid" }, { status: 400 });
  const view = await getSurgeonLeaderboard(body.date, uid);
  return NextResponse.json(view, { headers: PRIVATE_NO_STORE });
}
