import { NextResponse } from "next/server";
import { bpKeyOk, type BlueprintKey } from "@/lib/blueprint";
import { isBpBoardEnabled, getBpLeaderboard } from "@/lib/blueprintBoard";
import { rateLimit, ipOf } from "@/lib/redis";
import { BOARD_CACHE, PRIVATE_NO_STORE } from "@/lib/boardCache";
import { getSession } from "@/lib/authServer";
import { isAnonUid } from "@/lib/auth";

export const runtime = "nodejs";

// Read the day's blueprint board: GET ?date=YYYY-M-D&bp=<blueprint|all> (public),
// POST {date, bp, uid} (personalized). Separate bucket from the submit POST so board polling can't
// starve submits.

const DATE_RE = /^\d{4}-\d{1,2}-\d{1,2}$/;
const limited = async (req: Request) => !(await rateLimit(`rl:bpboard:${ipOf(req)}`, 60, 60));
const boardKey = (bp: unknown): BlueprintKey | "all" | null => (bp == null || bp === "all" ? "all" : bpKeyOk(bp) ? bp : null);

// Public, un-personalized read (CDN-cached). Any uid query param is IGNORED — the bearer anon uid must
// never ride a URL (DESIGN.md §12); personalized reads POST it (mirrors daily/leaderboard).
export async function GET(req: Request) {
  if (!isBpBoardEnabled()) return NextResponse.json({ error: "leaderboard not configured" }, { status: 503 });
  if (await limited(req)) return NextResponse.json({ error: "too many requests" }, { status: 429 });
  const url = new URL(req.url);
  const date = url.searchParams.get("date") ?? "";
  if (!DATE_RE.test(date)) return NextResponse.json({ error: "bad date" }, { status: 400 });
  const bp = boardKey(url.searchParams.get("bp"));
  if (!bp) return NextResponse.json({ error: "bad blueprint" }, { status: 400 });
  const view = await getBpLeaderboard(date, bp);
  return NextResponse.json(view, { headers: BOARD_CACHE });
}

// Personalized read ("you" + `me`): uid in the POST body, never cached; a session wins over the body uid.
export async function POST(req: Request) {
  if (!isBpBoardEnabled()) return NextResponse.json({ error: "leaderboard not configured" }, { status: 503 });
  if (await limited(req)) return NextResponse.json({ error: "too many requests" }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) ?? {};
  if (typeof body.date !== "string" || !DATE_RE.test(body.date)) return NextResponse.json({ error: "bad date" }, { status: 400 });
  const bp = boardKey(body.bp);
  if (!bp) return NextResponse.json({ error: "bad blueprint" }, { status: 400 });
  const uid = (await getSession())?.uid ?? (isAnonUid(body.uid) ? body.uid : null);
  if (!uid) return NextResponse.json({ error: "bad uid" }, { status: 400 });
  const view = await getBpLeaderboard(body.date, bp, uid);
  return NextResponse.json(view, { headers: PRIVATE_NO_STORE });
}
