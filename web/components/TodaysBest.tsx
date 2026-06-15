"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { dayUTC } from "@/lib/day";
import type { LeaderboardView } from "@/lib/types";

// Live social-proof strip for the landing hero. Fetches today's Daily board on mount and shows the
// leader + how many have played — the FOMO signal the funnel audit flagged as the single biggest
// CRO lever. Degrades to an always-true credible line (the verified draftable ceiling) when the
// board is empty or unconfigured (local dev returns 503), so it never renders a broken/empty state.
export default function TodaysBest() {
  const [view, setView] = useState<LeaderboardView | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`/api/daily/leaderboard?date=${dayUTC()}`);
        if (!alive || !r.ok) return;
        const v = (await r.json()) as LeaderboardView;
        if (alive) setView(v);
      } catch { /* keep the fallback line */ }
    })();
    return () => { alive = false; };
  }, []);

  const leader = view?.top?.[0];
  const total = view?.total ?? 0;

  if (leader) {
    return (
      <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 font-mono text-sm text-zinc-400 lg:justify-start">
        <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
        <span className="uppercase tracking-wide text-zinc-500">Today&apos;s best</span>
        <Link href={`/r/${leader.lineup}`} className="font-bold text-zinc-100 hover:text-orange-300">
          <span className="text-green-400">{leader.wins}</span>
          <span className="text-zinc-600">–</span>
          <span className="text-red-400">{leader.losses}</span>
          <span className="ml-1.5 font-normal text-zinc-400">by {leader.name}</span>
        </Link>
        {total > 1 && <span className="text-zinc-600">· {total.toLocaleString()} lineups today</span>}
      </p>
    );
  }

  return (
    <p className="font-mono text-sm text-zinc-500">
      Best draftable five ever found: <span className="font-bold text-green-400">79–3</span>
      <span className="text-zinc-600"> · nobody&apos;s gone 82–0 yet</span>
    </p>
  );
}
