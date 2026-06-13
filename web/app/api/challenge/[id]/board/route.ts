import { NextResponse } from "next/server";
import { isChallengeEnabled, getChallengeBoard } from "@/lib/challengeStore";
import { rateLimit, ipOf } from "@/lib/redis";

export const runtime = "nodejs";

// Public spectator board: the ranked records for a challenge (name/W-L/net) with no lineup or uid.
// Anyone with the link can watch the rivalry without playing — the /c/<id> page polls this.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isChallengeEnabled()) return NextResponse.json({ error: "challenges not configured" }, { status: 503 });
  if (!(await rateLimit(`rl:chalboard:${ipOf(req)}`, 120, 60))) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }
  const { id } = await params;
  if (!/^[a-z0-9]{6,16}$/.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  return NextResponse.json(await getChallengeBoard(id));
}
