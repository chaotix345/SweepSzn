import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { redis, rateLimit, ipOf, TTL } from "@/lib/redis";
import { pickemSeedOk, parseVote, PICKEM_VOTE_LUA } from "@/lib/pickem";

export const runtime = "nodejs";

// Pick'Em vote store: two INCR counters per seed (the existing ev:* pattern) plus a per-voter
// marker that makes the vote one-per-uid (IP-hash fallback when no uid). All keys carry the
// shared ~31d TTL. Self-disabling: without Redis both verbs 503 and the client hides crowd UI.

const UID_RE = /^[a-z0-9-]{8,64}$/i;
const keyY = (s: string) => `pickems:${s}:y`;
const keyN = (s: string) => `pickems:${s}:n`;
const keyV = (s: string, voter: string) => `pickems:${s}:voted:${voter}`;

// One vote per uid; an absent/invalid uid falls back to a hashed IP (never the raw IP).
function voterId(uid: unknown, req: Request): string {
  if (typeof uid === "string" && UID_RE.test(uid)) return `u:${uid.toLowerCase()}`;
  return `ip:${createHash("sha256").update(ipOf(req)).digest("hex").slice(0, 16)}`;
}

async function counts(seed: string): Promise<{ y: number; n: number }> {
  const [y, n] = (await redis!.mget<(string | number | null)[]>(keyY(seed), keyN(seed))) ?? [null, null];
  return { y: Number(y) || 0, n: Number(n) || 0 };
}

export async function GET(req: Request) {
  if (!redis) return NextResponse.json({ error: "pickem not configured" }, { status: 503 });
  // GET and POST get separate buckets so result-card crowd fetches can't starve vote POSTs.
  if (!(await rateLimit(`rl:pickem:g:${ipOf(req)}`, 60, 60))) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }
  const url = new URL(req.url);
  const seed = url.searchParams.get("seed");
  if (!pickemSeedOk(seed)) return NextResponse.json({ error: "bad seed" }, { status: 400 });
  try {
    const [c, vote] = await Promise.all([
      counts(seed),
      redis.get<string>(keyV(seed, voterId(url.searchParams.get("uid"), req))),
    ]);
    return NextResponse.json({ ...c, vote: parseVote(vote) });
  } catch {
    return NextResponse.json({ error: "pickem unavailable" }, { status: 503 });
  }
}

export async function POST(req: Request) {
  if (!redis) return NextResponse.json({ error: "pickem not configured" }, { status: 503 });
  if (!(await rateLimit(`rl:pickem:p:${ipOf(req)}`, 30, 60))) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  const seed = body?.seed;
  const vote = parseVote(body?.vote);
  if (!pickemSeedOk(seed) || !vote) return NextResponse.json({ error: "bad vote" }, { status: 400 });
  try {
    const voter = keyV(seed, voterId(body?.uid, req));
    // One atomic script: claim the voter slot, bump the matching counter, and read back the
    // stored pick + both counts. A replay (Daily re-run, refresh spam) can't double-count — it
    // just reads the original pick back — and a transient failure can no longer claim the voter
    // without counting the vote.
    const [claimed, stored, y, n] = (await redis.eval(
      PICKEM_VOTE_LUA,
      [voter, keyY(seed), keyN(seed)],
      [vote, TTL],
    )) as [number, string, string | number, string | number];
    return NextResponse.json({
      y: Number(y) || 0,
      n: Number(n) || 0,
      vote: parseVote(stored) ?? vote,
      already: !claimed,
    });
  } catch {
    return NextResponse.json({ error: "pickem unavailable" }, { status: 503 });
  }
}
