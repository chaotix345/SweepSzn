import { NextResponse } from "next/server";
import { getSession, setSessionCookie } from "@/lib/authServer";
import { signSession } from "@/lib/auth";
import { isRedisEnabled, rateLimit, ipOf } from "@/lib/redis";
import { cleanName } from "@/lib/clean";
import { setProfileName } from "@/lib/profileStore";

export const runtime = "nodejs";

// Set the editable display handle. Writes the canonical profile record AND re-mints the session JWT
// with the new name, so the cookie (which submit routes read as authoritative) stays in sync without
// a re-login. CSRF-guarded like the other authed mutations.
export async function POST(req: Request) {
  if (!isRedisEnabled()) return NextResponse.json({ error: "not configured" }, { status: 503 });
  if (req.headers.get("x-requested-with") !== "fetch") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!(await rateLimit(`rl:pname:${ipOf(req)}`, 20, 60))) return NextResponse.json({ error: "too many requests" }, { status: 429 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "auth_required" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) ?? {};
  const name = cleanName(body.name);
  if (!name) return NextResponse.json({ error: "bad name" }, { status: 400 });
  await setProfileName(session.uid, name);
  await setSessionCookie(await signSession({ uid: session.uid, name, picture: session.picture, anon: session.anon }));
  return NextResponse.json({ name });
}
