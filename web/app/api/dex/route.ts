import { NextResponse } from "next/server";
import { getSession } from "@/lib/authServer";
import { rateLimit, ipOf } from "@/lib/redis";
import { loadDexState, type DexResult } from "@/lib/dexState";

export const runtime = "nodejs";

// The Drafted Dex: every player a user has fielded, plus earned achievement badges. All descriptive:
// the collection rewards exploring the dataset, never optimizing a round (DESIGN.md §12).
//   GET  — the signed-in account's Dex (401 signed out). Kept for compatibility.
//   POST — local-first: the body carries the device's localStorage history ({ results }), so the Dex
//          works signed out, and is unioned with the account's Dex when signed in. Never 401s.
const MODES = new Set(["daily", "classic", "hoopiq", "challenge", "factorhunt", "prime", "blueprint", "surgeon", "duel"]);
const MAX_RESULTS = 60; // the client keeps 50 (lib/resultHistory CAP)

function cleanLocal(input: unknown): DexResult[] {
  if (!Array.isArray(input)) return [];
  const out: DexResult[] = [];
  for (const e of input.slice(0, MAX_RESULTS)) {
    if (!e || typeof e !== "object") continue;
    const r = e as Record<string, unknown>;
    if (typeof r.mode !== "string" || !MODES.has(r.mode)) continue;
    // a duel card carries both fives (same cap as /api/profile/sync); only yours counts (fieldedIds)
    if (typeof r.encoded !== "string" || !r.encoded || r.encoded.length > (r.mode === "duel" ? 640 : 256)) continue;
    out.push({ encoded: r.encoded, mode: r.mode, grade: typeof r.grade === "string" ? r.grade.slice(0, 4) : "" });
  }
  return out;
}

export async function GET(req: Request) {
  if (!(await rateLimit(`rl:dex:${ipOf(req)}`, 60, 60))) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "auth_required" }, { status: 401 });

  const { players, total, badges } = await loadDexState(session.uid);
  return NextResponse.json({ players, total, badges });
}

export async function POST(req: Request) {
  if (!(await rateLimit(`rl:dex:${ipOf(req)}`, 60, 60))) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }
  const body = (await req.json().catch(() => ({}))) ?? {};
  const local = cleanLocal((body as { results?: unknown }).results);
  const session = await getSession();
  const { players, total, badges } = await loadDexState(session?.uid ?? null, local);
  return NextResponse.json({ players, total, badges, signedIn: !!session });
}
