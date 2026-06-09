import { NextResponse } from "next/server";
import { isRedisEnabled, rateLimit, ipOf } from "@/lib/redis";
import { removeSubscription } from "@/lib/pushStore";
import { getSession } from "@/lib/authServer";

export const runtime = "nodejs";

const UID_RE = /^[a-z0-9-]{8,64}$/i;

// Drop one of the caller's push subscriptions (toggle-off / revoke). Guarded on redis (not VAPID) so a
// user can always clean up even after push is disabled. Only ever touches the caller's own uid.
export async function POST(req: Request) {
  if (!isRedisEnabled()) return NextResponse.json({ error: "not configured" }, { status: 503 });
  if (!(await rateLimit(`rl:pushuns:${ipOf(req)}`, 30, 60))) {
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
  const endpoint = body?.endpoint;
  if (typeof endpoint !== "string" || !endpoint.startsWith("https://") || endpoint.length > 1024) {
    return NextResponse.json({ error: "bad endpoint" }, { status: 400 });
  }
  await removeSubscription(uid, endpoint);
  return NextResponse.json({ ok: true });
}
