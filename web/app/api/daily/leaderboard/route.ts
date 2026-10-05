import { NextResponse } from "next/server";
import { isLeaderboardEnabled, getLeaderboard } from "@/lib/leaderboard";
import { rateLimit, ipOf } from "@/lib/redis";
import { BOARD_CACHE, PRIVATE_NO_STORE } from "@/lib/boardCache";
import { getSession } from "@/lib/authServer";
import { isAnonUid } from "@/lib/auth";

const DATE_RE = /^\d{4}-\d{1,2}-\d{1,2}$/;

// The board is CDN-cached, but cycling ?date= (or POSTing) bypasses the cache and reaches Redis, so
// bound per-IP volume (matches the challenge spectator board's 120/min). GET + POST share the bucket.
const limited = async (req: Request) => !(await rateLimit(`rl:dlboard:${ipOf(req)}`, 120, 60));

// Public, un-personalized read (CDN-cached). Any uid query param is IGNORED: the bearer anon uid must
// never ride a URL (DESIGN.md §12 — logs + CDN cache key), so a stale client just loses its "you" row.
export async function GET(req: Request) {
  if (!isLeaderboardEnabled()) return NextResponse.json({ error: "leaderboard not configured" }, { status: 503 });
  if (await limited(req)) return NextResponse.json({ error: "too many requests" }, { status: 429 });
  const date = new URL(req.url).searchParams.get("date");
  if (!date || !DATE_RE.test(date)) return NextResponse.json({ error: "bad date" }, { status: 400 });
  return NextResponse.json(await getLeaderboard(date), { headers: BOARD_CACHE });
}

// Personalized read ("you" + the `me` row marker): the uid rides the POST body, never cached. Identity
// mirrors the submit route — a session is authoritative, otherwise the body's anonymous uid (bounded
// by isAnonUid before it reaches Redis as an HGET field).
export async function POST(req: Request) {
  if (!isLeaderboardEnabled()) return NextResponse.json({ error: "leaderboard not configured" }, { status: 503 });
  if (await limited(req)) return NextResponse.json({ error: "too many requests" }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) ?? {};
  if (typeof body.date !== "string" || !DATE_RE.test(body.date)) return NextResponse.json({ error: "bad date" }, { status: 400 });
  const uid = (await getSession())?.uid ?? (isAnonUid(body.uid) ? body.uid : null);
  if (!uid) return NextResponse.json({ error: "bad uid" }, { status: 400 });
  return NextResponse.json(await getLeaderboard(body.date, uid), { headers: PRIVATE_NO_STORE });
}
