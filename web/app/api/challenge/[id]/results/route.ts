import { NextResponse } from "next/server";
import { isChallengeEnabled, getChallengeOwnerView } from "@/lib/challengeStore";
import { getSession } from "@/lib/authServer";
import { rateLimit, ipOf } from "@/lib/redis";

export const runtime = "nodejs";

const ID_RE = /^[a-z0-9]{6,16}$/;
const UID_RE = /^[a-z0-9-]{8,64}$/i;

// The creator's dashboard for a challenge they made: their five plus every responder's five + verdict.
// Identity resolution mirrors the submit route — a signed-in session is authoritative (un-fakeable);
// otherwise the client's anonymous uid from the POST body. Only the creator (whose uid matches the
// write-once creator uid) gets data; everyone else gets 403. The creator's uid never appears on the
// public board, so matching it is as strong as identity gets in the anonymous model.
// POST (not GET) so the anon uid stays out of server/CDN logs.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isChallengeEnabled()) return NextResponse.json({ error: "challenges not configured" }, { status: 503 });
  if (!(await rateLimit(`rl:chalown:${ipOf(req)}`, 120, 60))) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }
  const { id } = await params;
  if (!ID_RE.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const session = await getSession();
  let uid: string;
  if (session) {
    uid = session.uid;
  } else {
    let body: unknown;
    try { body = await req.json(); } catch { body = null; }
    const q: string = (body && typeof body === "object" && "uid" in body && typeof (body as Record<string, unknown>).uid === "string")
      ? (body as Record<string, unknown>).uid as string
      : "";
    if (!UID_RE.test(q)) return NextResponse.json({ error: "bad uid" }, { status: 400 });
    uid = q;
  }

  const out = await getChallengeOwnerView(id, uid);
  if (!out) return NextResponse.json({ error: "challenges not configured" }, { status: 503 });
  if (out.status === "not_found") return NextResponse.json({ error: "not found" }, { status: 404 });
  if (out.status === "forbidden") return NextResponse.json({ error: "not your challenge" }, { status: 403 });
  return NextResponse.json(out.view);
}
