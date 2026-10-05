import { NextResponse } from "next/server";
import { rateLimit, ipOf } from "@/lib/redis";
import { isNotifyEnabled, getNotifs } from "@/lib/notifyStore";
import { getSession } from "@/lib/authServer";
import { isAnonUid } from "@/lib/auth";
import { PRIVATE_NO_STORE } from "@/lib/boardCache";

export const runtime = "nodejs";

// Read the caller's notification inbox. Identity mirrors api/challenge/[id]/results: a valid session
// is authoritative; otherwise the client's anonymous uid (which the caller must already possess — no
// endpoint ever discloses someone else's uid). Returns only the caller's own items. The anon uid
// rides the POST body — never a URL (DESIGN.md §12; this is polled) — so GET serves a session only
// and ignores any uid query param.
async function inbox(req: Request, anonUid: unknown) {
  if (!isNotifyEnabled()) return NextResponse.json({ error: "notifications not configured" }, { status: 503 });
  if (!(await rateLimit(`rl:notif:${ipOf(req)}`, 120, 60))) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }
  const uid = (await getSession())?.uid ?? (isAnonUid(anonUid) ? anonUid : null);
  if (!uid) return NextResponse.json({ error: "bad uid" }, { status: 400 });
  return NextResponse.json(await getNotifs(uid), { headers: PRIVATE_NO_STORE });
}

export async function GET(req: Request) {
  return inbox(req, null);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  return inbox(req, body?.uid);
}
