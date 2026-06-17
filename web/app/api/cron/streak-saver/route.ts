import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { dayUTC } from "@/lib/day";
import { isPushEnabled, sendRawPushToUid } from "@/lib/pushStore";
import { logError } from "@/lib/log";

export const runtime = "nodejs";

// Streak-saver nudge (the deferred piece of the 2026-06-10 re-engagement design): players who
// posted a Daily score YESTERDAY but not TODAY get one push before the day rolls over. The Daily
// resets at 00:00 UTC (see lib/day.ts — every board key is a UTC date); vercel.json schedules
// this at 21:00 UTC, a 3-hour warning. Identity needs no server-side streak state: being on
// yesterday's board IS the streak signal, and push:<uid> existing means they opted in.
//
// Auth: Vercel cron invokes with Authorization: Bearer <CRON_SECRET> when the env var is set.
// Self-disabling like everything else — no CRON_SECRET (or no redis/push) means 503, not a crash.
//
// Idempotent by construction: SADD into streaknudge:<date> is the atomic once-per-day claim —
// a re-run (or two overlapping runs) can't double-send to the same uid.

export const NUDGE_CAP = 500; // bounds one run's webpush fan-out; leftovers just miss the nudge

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "cron not configured" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "forbidden" }, { status: 401 });
  if (!redis) return NextResponse.json({ error: "leaderboard not configured" }, { status: 503 });
  if (!isPushEnabled()) return NextResponse.json({ error: "push not configured" }, { status: 503 });

  const today = dayUTC();
  const y = new Date();
  y.setUTCDate(y.getUTCDate() - 1);
  const yesterday = dayUTC(y);

  // Re-engage players who played ANY daily-seeded board yesterday but none today. Daily, Factor
  // Hunt, Surgeon and Blueprint all reset at 00:00 UTC, so lapsing on any of them is the same
  // "broke a daily habit" signal — not just the Classic Daily.
  const dailyBoards = (d: string) => [`lb:${d}`, `lb:fh:${d}`, `lb:surgeon:${d}`, `lb:bp:${d}:all`];
  const unionMembers = async (d: string): Promise<string[]> => {
    const lists = await Promise.all(dailyBoards(d).map((k) => redis!.zrange<string[]>(k, 0, -1)));
    return [...new Set(lists.flat().map(String))];
  };

  try {
    const [yMembers, tMembers] = await Promise.all([unionMembers(yesterday), unionMembers(today)]);
    const played = new Set(tMembers);
    const candidates = yMembers.filter((u) => !played.has(u));

    // claim all candidates in one pipeline; sadd=0 means a previous run already nudged that uid
    const claimKey = `streaknudge:${today}`;
    let claimed: string[] = [];
    if (candidates.length) {
      const p = redis.pipeline();
      for (const uid of candidates) p.sadd(claimKey, uid);
      const results = (await p.exec()) as number[];
      claimed = candidates.filter((_, i) => Number(results[i]) === 1);
      await redis.expire(claimKey, 60 * 60 * 48); // self-cleaning; outlives any re-run window
    }

    const targets = claimed.slice(0, NUDGE_CAP);
    let sent = 0;
    for (const uid of targets) {
      // sendRawPushToUid is false for uids with no subscription — most players; that's expected
      if (await sendRawPushToUid(uid, {
        title: "🔥 Your streak is on the line",
        body: "You played yesterday but not today — today's boards reset at midnight UTC.",
        url: "/play",
      })) sent++;
    }

    return NextResponse.json({
      date: today,
      candidates: candidates.length,
      alreadyNudged: candidates.length - claimed.length,
      capped: Math.max(0, claimed.length - NUDGE_CAP),
      sent,
    });
  } catch (err) {
    logError("cron.streakSaver", err);
    return NextResponse.json({ error: "cron failed" }, { status: 500 });
  }
}
