import { NextResponse } from "next/server";
import { rateLimit, ipOf } from "@/lib/redis";
import { isNotifyEnabled, markNotifsRead } from "@/lib/notifyStore";
import { getSession } from "@/lib/authServer";

export const runtime = "nodejs";

const UID_RE = /^[a-z0-9-]{8,64}$/i;

// Mark the caller's inbox read (sets the read watermark). Only ever affects the caller's own uid.
export async function POST(req: Request) {
  if (!isNotifyEnabled()) return NextResponse.json({ error: "notifications not configured" }, { status: 503 });
  if (!(await rateLimit(`rl:notifrd:${ipOf(req)}`, 120, 60))) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  const session = await getSession();
  let uid: string;
  if (session) {
    uid = session.uid;
  } else {
    if (typeof body?.uid !== "string" || !UID_RE.test(body.uid)) return NextResponse.json({ error: "bad uid" }, { status: 400 });
    uid = body.uid;
  }
  return NextResponse.json({ unread: await markNotifsRead(uid) });
}
