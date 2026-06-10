import { NextResponse } from "next/server";
import { bpKeyOk } from "@/lib/blueprint";
import { isBpBoardEnabled, getBpLeaderboard } from "@/lib/blueprintBoard";
import { rateLimit, ipOf } from "@/lib/redis";

export const runtime = "nodejs";

// Read the day's blueprint board: ?date=YYYY-M-D&bp=<blueprint|all>&uid=<optional>.
// Separate GET bucket from the submit POST so board polling can't starve submits.

const DATE_RE = /^\d{4}-\d{1,2}-\d{1,2}$/;
const UID_RE = /^[a-z0-9-]{8,64}$/i;

export async function GET(req: Request) {
  if (!isBpBoardEnabled()) return NextResponse.json({ error: "leaderboard not configured" }, { status: 503 });
  if (!(await rateLimit(`rl:bpboard:${ipOf(req)}`, 60, 60))) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }
  const url = new URL(req.url);
  const date = url.searchParams.get("date") ?? "";
  const bpParam = url.searchParams.get("bp") ?? "all";
  const uidParam = url.searchParams.get("uid");
  if (!DATE_RE.test(date)) return NextResponse.json({ error: "bad date" }, { status: 400 });
  const bp = bpParam === "all" ? "all" : bpKeyOk(bpParam) ? bpParam : null;
  if (!bp) return NextResponse.json({ error: "bad blueprint" }, { status: 400 });
  // a present-but-malformed uid is a 400, not a silent anonymous read (FH board route parity)
  if (uidParam != null && !UID_RE.test(uidParam)) return NextResponse.json({ error: "bad uid" }, { status: 400 });
  const view = await getBpLeaderboard(date, bp, uidParam ?? undefined);
  return NextResponse.json(view);
}
