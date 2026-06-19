import { NextResponse } from "next/server";
import { redis, rateLimit, ipOf } from "@/lib/redis";
import { getSession } from "@/lib/authServer";
import { refCodeFor } from "@/lib/referralCode";
import { UID_RE } from "@/lib/evServer";

export const runtime = "nodejs";

// A re-mint (the invite UI calls this whenever it opens) refreshes the reverse map, so dormant
// codes expiring is fine and bounds the keyspace against floods of distinct uids.
const CODE_TTL = 60 * 60 * 24 * 90; // 90 days

// Mint (idempotent) this user's referral code and return it + their all-time referral count. The
// code is an opaque public proxy for the uid (DESIGN.md §12 — the bearer uid never goes in a URL);
// the reverse map ref:code:<code> → uid is what /api/ev decodes to credit the referrer on a referred
// first_play. A signed-in session.uid is preferred (cross-device durable); otherwise the anon uid
// rides the POST body (the same uid-in-body pattern as /api/ev), regex-bounded before use.
export async function POST(req: Request) {
  if (!(await rateLimit(`rl:ref:${ipOf(req)}`, 30, 60))) return new Response(null, { status: 429 });
  const session = await getSession();
  let uid = session?.uid;
  if (!uid) {
    const body = (await req.json().catch(() => null)) as { uid?: unknown } | null;
    if (body && typeof body.uid === "string" && UID_RE.test(body.uid)) uid = body.uid;
  }
  if (!uid) return NextResponse.json({ error: "invalid uid" }, { status: 400 });

  const code = refCodeFor(uid);
  let credits = 0;
  if (redis) {
    await redis.set(`ref:code:${code}`, uid, { ex: CODE_TTL });
    credits = Number(await redis.get(`ref:credits:${uid}`)) || 0;
  }
  return NextResponse.json({ code, credits });
}
