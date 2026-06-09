import { NextResponse } from "next/server";
import { rateLimit, ipOf } from "@/lib/redis";
import { isNotifyEnabled, getNotifs } from "@/lib/notifyStore";
import { getSession } from "@/lib/authServer";

export const runtime = "nodejs";

const UID_RE = /^[a-z0-9-]{8,64}$/i;

// Read the caller's notification inbox. Identity mirrors api/challenge/[id]/results: a valid session
// is authoritative; otherwise the client's anonymous uid (which the caller must already possess — no
// endpoint ever discloses someone else's uid). Returns only the caller's own items.
export async function GET(req: Request) {
  if (!isNotifyEnabled()) return NextResponse.json({ error: "notifications not configured" }, { status: 503 });
  if (!(await rateLimit(`rl:notif:${ipOf(req)}`, 120, 60))) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }
  const session = await getSession();
  let uid: string;
  if (session) {
    uid = session.uid;
  } else {
    const q = new URL(req.url).searchParams.get("uid") ?? "";
    if (!UID_RE.test(q)) return NextResponse.json({ error: "bad uid" }, { status: 400 });
    uid = q;
  }
  return NextResponse.json(await getNotifs(uid));
}
