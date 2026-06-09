import { NextResponse } from "next/server";
import { isChallengeEnabled, getChallengePublic } from "@/lib/challengeStore";
import { rateLimit, ipOf } from "@/lib/redis";

export const runtime = "nodejs";

// Redacted bootstrap for a responder: returns the bar (record + grade), the draft seed to replay,
// the responder count, and whether the creator used hints — never any lineup or uid. Used by the
// client to enter respond mode with the SAME spins the creator faced.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isChallengeEnabled()) return NextResponse.json({ error: "challenges not configured" }, { status: 503 });
  if (!(await rateLimit(`rl:chalget:${ipOf(req)}`, 120, 60))) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }
  const { id } = await params;
  if (!/^[a-z0-9]{6,16}$/.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const info = await getChallengePublic(id);
  if (!info) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(info);
}
