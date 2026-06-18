import { NextResponse } from "next/server";
import { resolveSharedLineup } from "@/lib/sharedLineup";
import { rateLimit, ipOf } from "@/lib/redis";

export const runtime = "nodejs";

// JSON sibling of the /r/[lineup] share page: decode + re-evaluate a shared lineup segment and return
// its five players + result. Powers the post-game "vs Friend" compare (paste a link → fetch their
// five). Fully reconstructed from the encoded segment — no Redis, no auth, public + rate-limited.
export async function GET(req: Request, { params }: { params: Promise<{ lineup: string }> }) {
  if (!(await rateLimit(`rl:result:${ipOf(req)}`, 120, 60))) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }
  const { lineup } = await params;
  const data = resolveSharedLineup(lineup);
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(data);
}
