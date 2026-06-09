import { NextResponse } from "next/server";
import { rateLimit, ipOf } from "@/lib/redis";
import { validateSubscription } from "@/lib/notify";
import { isPushEnabled, saveSubscription } from "@/lib/pushStore";
import { getSession } from "@/lib/authServer";

export const runtime = "nodejs";

const UID_RE = /^[a-z0-9-]{8,64}$/i;

// Store a web-push subscription for the caller's uid. Self-disabling: 503 when VAPID isn't configured
// (the client opt-in is also hidden in that case). Identity mirrors the other uid-gated routes.
export async function POST(req: Request) {
  if (!isPushEnabled()) return NextResponse.json({ error: "push not configured" }, { status: 503 });
  if (!(await rateLimit(`rl:pushsub:${ipOf(req)}`, 30, 60))) {
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
  const sub = validateSubscription(body?.subscription);
  if (!sub) return NextResponse.json({ error: "bad subscription" }, { status: 400 });
  const ok = await saveSubscription(uid, sub);
  return NextResponse.json({ ok }, { status: ok ? 200 : 503 });
}
