import { NextResponse } from "next/server";
import { isFhBoardEnabled, getFhLeaderboard } from "@/lib/factorHuntBoard";
import { rateLimit, ipOf } from "@/lib/redis";
import { BOARD_CACHE, PRIVATE_NO_STORE } from "@/lib/boardCache";
import { getSession } from "@/lib/authServer";
import { isAnonUid } from "@/lib/auth";

const DATE_RE = /^\d{4}-\d{1,2}-\d{1,2}$/;

// each call is 3-5 Redis round-trips — keep a flood from amplifying into Redis egress (GET + POST share it)
const limited = async (req: Request) => !(await rateLimit(`rl:fhboard:${ipOf(req)}`, 60, 60));

// Public, un-personalized read (CDN-cached). Any uid query param is IGNORED — the bearer anon uid must
// never ride a URL (DESIGN.md §12); personalized reads POST it (mirrors daily/leaderboard).
export async function GET(req: Request) {
  if (!isFhBoardEnabled()) return NextResponse.json({ error: "leaderboard not configured" }, { status: 503 });
  if (await limited(req)) return NextResponse.json({ error: "too many requests" }, { status: 429 });
  const date = new URL(req.url).searchParams.get("date");
  if (!date || !DATE_RE.test(date)) return NextResponse.json({ error: "bad date" }, { status: 400 });
  return NextResponse.json(await getFhLeaderboard(date), { headers: BOARD_CACHE });
}

// Personalized read ("you" + `me`): uid in the POST body, never cached; a session wins over the body uid.
export async function POST(req: Request) {
  if (!isFhBoardEnabled()) return NextResponse.json({ error: "leaderboard not configured" }, { status: 503 });
  if (await limited(req)) return NextResponse.json({ error: "too many requests" }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) ?? {};
  if (typeof body.date !== "string" || !DATE_RE.test(body.date)) return NextResponse.json({ error: "bad date" }, { status: 400 });
  const uid = (await getSession())?.uid ?? (isAnonUid(body.uid) ? body.uid : null);
  if (!uid) return NextResponse.json({ error: "bad uid" }, { status: 400 });
  return NextResponse.json(await getFhLeaderboard(body.date, uid), { headers: PRIVATE_NO_STORE });
}
