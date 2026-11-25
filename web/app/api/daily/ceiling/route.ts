import { NextResponse } from "next/server";
import { getDailyCeiling, type CeilingRecord } from "@/lib/dailyCeiling";
import { isLeaderboardEnabled, getDailyRow } from "@/lib/leaderboard";
import { rateLimit, ipOf } from "@/lib/redis";
import { PRIVATE_NO_STORE } from "@/lib/boardCache";
import { getSession } from "@/lib/authServer";
import { isAnonUid } from "@/lib/auth";
import { dayUTC } from "@/lib/day";

export const runtime = "nodejs";

// The Daily ceiling ("best five from today's spins", W2) under DESIGN.md §12:
// - today: only the ceiling RECORD plus the viewer's gap, only by POST, and only to a viewer with a
//   verified Daily submission today (session first, else the anon uid in the body — never a URL).
// - past days (the Daily has rolled over at 00:00 UTC): the full five, to anyone.
// - future days: nothing, ever.

// First Daily seed the app ever served; earlier dates have no Daily.
const FIRST_DAILY = Date.UTC(2026, 5, 6);

// "YYYY-M-D" (the lb:/seed key spelling), zero-padding tolerated but normalized: the seed string is
// hashed, so "2026-06-09" must not silently become a different Daily than "2026-6-9".
function parseDay(s: unknown): { date: string; ms: number } | null {
  if (typeof s !== "string") return null;
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (!m) return null;
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(ms);
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
  return { date: dayUTC(d), ms };
}

type When = "past" | "today" | "future" | "none";
function when(ms: number): When {
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (ms < FIRST_DAILY) return "none";
  return ms < today ? "past" : ms === today ? "today" : "future";
}

const limited = async (req: Request) => !(await rateLimit(`rl:ceiling:${ipOf(req)}`, 30, 60));
const reveal = (rec: CeilingRecord) => ({
  wins: rec.wins, losses: rec.losses, netRtg: rec.netRtg, grade: rec.grade, label: rec.label, lineup: rec.lineup, seg: rec.seg,
});
const PAST_CACHE = { "cache-control": "public, s-maxage=86400, stale-while-revalidate=604800" } as const;

// Public read of a rolled-over Daily's best five (W3's archive). Today's and future days are refused.
export async function GET(req: Request) {
  if (await limited(req)) return NextResponse.json({ error: "too many requests" }, { status: 429 });
  const d = parseDay(new URL(req.url).searchParams.get("date"));
  if (!d) return NextResponse.json({ error: "bad date" }, { status: 400 });
  const w = when(d.ms);
  if (w === "none") return NextResponse.json({ error: "no daily" }, { status: 404 });
  if (w !== "past") return NextResponse.json({ error: "locked until the daily rolls over" }, { status: 403 });
  const rec = await getDailyCeiling(d.date);
  if (!rec) return NextResponse.json({ error: "no ceiling" }, { status: 404 });
  return NextResponse.json({ date: d.date, ceiling: reveal(rec) }, { headers: PAST_CACHE });
}

// Personalized read: today's record + your gap (after a verified submit), or a past day's five + your gap.
export async function POST(req: Request) {
  if (await limited(req)) return NextResponse.json({ error: "too many requests" }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) ?? {};
  const d = parseDay(body.date);
  if (!d) return NextResponse.json({ error: "bad date" }, { status: 400 });
  const w = when(d.ms);
  if (w === "none") return NextResponse.json({ error: "no daily" }, { status: 404 });
  if (w === "future") return NextResponse.json({ error: "locked until the daily rolls over" }, { status: 403 });

  const lbOn = isLeaderboardEnabled();
  if (w === "today" && !lbOn) return NextResponse.json({ error: "leaderboard not configured" }, { status: 503 });
  const uid = (await getSession())?.uid ?? (isAnonUid(body.uid) ? body.uid : null);
  if (w === "today" && !uid) return NextResponse.json({ error: "bad uid" }, { status: 400 });
  const row = lbOn && uid ? await getDailyRow(d.date, uid) : null;
  // §12: nothing about today's ceiling leaves the server before the viewer has a committed result
  if (w === "today" && !row) return NextResponse.json({ error: "submit today's daily first" }, { status: 403 });

  const rec = await getDailyCeiling(d.date);
  if (!rec) return NextResponse.json({ error: "no ceiling" }, { status: 404 });
  const you = row ? { wins: row.wins, gap: rec.wins - row.wins } : undefined;
  const ceiling = w === "today" ? { wins: rec.wins, losses: rec.losses } : reveal(rec);
  return NextResponse.json({ date: d.date, ceiling, you }, { headers: PRIVATE_NO_STORE });
}
