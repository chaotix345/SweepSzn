import { NextResponse } from "next/server";
import { getSession } from "@/lib/authServer";
import { rateLimit, ipOf } from "@/lib/redis";
import { loadDexState } from "@/lib/dexState";

export const runtime = "nodejs";

// The signed-in user's Drafted Dex: every player they've ever fielded (derived from their stored
// results), plus earned achievement badges. All descriptive — the collection rewards exploring the
// dataset, never optimizing a round (DESIGN.md §12). Auth-gated; falls back to a sign-in prompt client-side.
export async function GET(req: Request) {
  if (!(await rateLimit(`rl:dex:${ipOf(req)}`, 60, 60))) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "auth_required" }, { status: 401 });

  const { players, total, badges } = await loadDexState(session.uid);
  return NextResponse.json({ players, total, badges });
}
