"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useNextDailyCountdown } from "@/components/useNextDaily";
import { getUid } from "@/lib/streak";
import { playedDays, bestWins } from "@/lib/archiveHistory";
import { yesterdayUTC } from "@/lib/day";

type Yesterday = { date: string; wins: number; losses: number; mine?: number };

// W3 "a reason to come back", under today's Daily result (below Share / Build Another): the next-Daily
// countdown, the hook for tomorrow's reveal, the streak, and — when the player played yesterday —
// yesterday's revealed perfect five and how they did against it. Yesterday has rolled over, so its five
// is public (DESIGN.md §12); today's stays hidden until tomorrow.
export default function DailyComeback({ streak }: { streak: number }) {
  const countdown = useNextDailyCountdown();
  const [y, setY] = useState<Yesterday | null>(null);

  useEffect(() => {
    const date = yesterdayUTC();
    let local: number | undefined;

    try { local = bestWins(playedDays()[date]); } catch { /* private mode */ }
    const ctl = new AbortController();
    // the anon uid rides the body, never a URL; the server adds your board row for that day if it has one
    fetch("/api/daily/ceiling", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ date, uid: getUid() }), signal: ctl.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => {
        const c = v?.ceiling;
        if (!c || typeof c.wins !== "number" || typeof c.losses !== "number") return;
        const board = typeof v?.you?.wins === "number" ? v.you.wins : undefined;
        const mine = board == null ? local : local == null ? board : Math.max(board, local);
        setY({ date, wins: c.wins, losses: c.losses, mine }); // shown to everyone: the example is the hook
      })
      .catch(() => { /* quietly hidden */ });
    return () => ctl.abort();
  }, []);

  const gap = y?.mine == null ? null : y.wins - y.mine;
  return (
    <section aria-label="Come back tomorrow" data-testid="daily-comeback"
      className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 text-left">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Next Daily in</div>
          <div className="font-display text-3xl tabular-nums text-zinc-100" data-testid="next-daily">{countdown}</div>
        </div>
        {streak > 0 && (
          <div className="text-right" aria-label={`${streak}-day streak`}>
            <div className="font-display text-3xl tabular-nums text-orange-300">🔥 {streak}</div>
            <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">day streak</div>
          </div>
        )}
      </div>
      <p className="mt-2 text-sm font-medium text-zinc-200">Tomorrow: see today&apos;s perfect five.</p>
      {y && (
        <Link href={`/archive?d=${y.date}`} className="mt-3 flex min-h-11 items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-300 transition hover:border-zinc-600">
          <span>
            Yesterday&apos;s perfect five went <span className="font-semibold tabular-nums text-zinc-100">{y.wins}-{y.losses}</span>
            {gap != null && <> · {gap > 0 ? <>you were <span className="font-semibold tabular-nums text-zinc-100">{gap}</span> off</> : gap === 0 ? "you matched it" : "you beat it"}</>}
          </span>
          <span className="shrink-0 font-semibold text-orange-400">See it →</span>
        </Link>
      )}
      <Link href="/archive" className="mt-2 inline-flex min-h-11 items-center text-xs font-semibold text-zinc-400 transition hover:text-zinc-200">
        Replay past Dailies · unranked →
      </Link>
    </section>
  );
}
