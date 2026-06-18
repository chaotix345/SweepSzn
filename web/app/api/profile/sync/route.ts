import { NextResponse, after } from "next/server";
import { getSession } from "@/lib/authServer";
import { isRedisEnabled, rateLimit, ipOf } from "@/lib/redis";
import { syncStreakDates, syncResults, getStreakCount, getStoredBadges, addStoredBadges, type ProfileResult } from "@/lib/profileStore";
import { loadDexState } from "@/lib/dexState";
import { enqueueNotif } from "@/lib/notifyStore";
import { buildBadgeNotification } from "@/lib/notify";
import { BADGES } from "@/lib/dex";

export const runtime = "nodejs";

// Merge a device's local progress (completed-daily dates + result history) up into the account. Used
// both for the one-time first-sign-in claim (full local arrays) and for ongoing single-entry pushes as
// games finish. Idempotent union merge — re-running never duplicates. Display-only data, so it's
// lightly trusted and strictly bounded here at the trust boundary.
const MODES = new Set(["daily", "classic", "hoopiq", "challenge", "factorhunt", "prime", "blueprint", "surgeon"]);
const MAX_DATES = 400;
const MAX_RESULTS = 50;

function cleanResults(input: unknown): ProfileResult[] {
  if (!Array.isArray(input)) return [];
  const out: ProfileResult[] = [];
  for (const e of input.slice(0, MAX_RESULTS)) {
    if (!e || typeof e !== "object") continue;
    const r = e as Record<string, unknown>;
    if (typeof r.encoded !== "string" || !r.encoded || r.encoded.length > 256) continue;
    if (typeof r.mode !== "string" || !MODES.has(r.mode)) continue;
    const wins = Number(r.wins), losses = Number(r.losses), ts = Number(r.ts);
    if (!Number.isFinite(wins) || !Number.isFinite(losses)) continue;
    out.push({
      encoded: r.encoded,
      mode: r.mode,
      wins: Math.max(0, Math.min(82, Math.trunc(wins))),
      losses: Math.max(0, Math.min(82, Math.trunc(losses))),
      grade: typeof r.grade === "string" ? r.grade.slice(0, 4) : "",
      // clamp to now (+60s clock-skew slack) so a fabricated far-future ts can't pin an entry at the top forever
      ts: Number.isFinite(ts) && ts > 0 ? Math.min(ts, Date.now() + 60_000) : Date.now(),
      ...(typeof r.challengeId === "string" ? { challengeId: r.challengeId.slice(0, 64) } : {}),
    });
  }
  return out;
}

export async function POST(req: Request) {
  if (!isRedisEnabled()) return NextResponse.json({ error: "not configured" }, { status: 503 });
  if (req.headers.get("x-requested-with") !== "fetch") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!(await rateLimit(`rl:psync:${ipOf(req)}`, 30, 60))) return NextResponse.json({ error: "too many requests" }, { status: 429 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "auth_required" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) ?? {};
  const history = Array.isArray(body.history)
    ? body.history.slice(0, MAX_DATES).filter((x: unknown): x is string => typeof x === "string")
    : [];
  const results = cleanResults(body.results);

  await syncStreakDates(session.uid, history);
  const merged = await syncResults(session.uid, results);
  const streak = await getStreakCount(session.uid, Date.now());

  // Fire a notification when a Dex badge NEWLY unlocks (post-commit, descriptive — §12). Diffed against
  // the badges:{uid} snapshot so it never re-pings; suppressed on the first-ever sync (the sign-in
  // backfill) so a returning player isn't flooded with their whole history's worth at once. Deferred so
  // the extra reads never slow the hot sync path; best-effort (notifications must not break the route).
  if (merged > 0) {
    const uid = session.uid;
    after(async () => {
      const prev = await getStoredBadges(uid);
      const { badges } = await loadDexState(uid);
      const fresh = badges.filter((b) => !prev.includes(b));
      if (!fresh.length) return;
      await addStoredBadges(uid, fresh);
      if (!prev.length) return; // first snapshot — record it silently, don't backfill-spam the inbox
      const now = Date.now();
      for (const b of fresh) {
        const name = BADGES.find((d) => d.key === b)?.name ?? b;
        await enqueueNotif(uid, buildBadgeNotification(b, name, now));
      }
    });
  }
  return NextResponse.json({ streak, results: merged });
}
