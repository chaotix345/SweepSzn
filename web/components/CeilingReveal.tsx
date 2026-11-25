"use client";
import { useEffect, useState } from "react";
import FiveStrip from "@/components/FiveStrip";
import { getUid } from "@/lib/streak";
import { GRADE_COLOR } from "@/lib/grades";
import type { Slot } from "@/lib/types";

type Revealed = {
  wins: number; losses: number; grade: string; label: string; seg: string;
  lineup: { id: string; name: string; team: string; decade: string; slot: Slot }[];
};

const shortDay = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
};

// A rolled-over Daily's revealed best five ("best five from that day's spins", W2), plus how the
// viewer did against it when they played that day. The server only reveals past days (DESIGN.md §12);
// for today it answers 403 and this renders nothing. W3's archive and "see yesterday's perfect five"
// mount it. `yourWins` is the result to compare when the caller has one (an archive replay, or a day the
// board no longer holds — boards expire after ~31 days); otherwise the viewer's board row for that day.
export default function CeilingReveal({ date, yourWins }: { date: string; yourWins?: number }) {
  const [state, setState] = useState<{ date: string; c: Revealed; you?: number } | null>(null);
  useEffect(() => {
    const ctl = new AbortController();
    fetch("/api/daily/ceiling", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ date, uid: getUid() }), signal: ctl.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => {
        const c = v?.ceiling as Revealed | undefined;
        if (c && Array.isArray(c.lineup) && c.lineup.length === 5) setState({ date, c, you: typeof v.you?.wins === "number" ? v.you.wins : undefined });
      })
      .catch(() => { /* quietly hidden */ });
    return () => ctl.abort();
  }, [date]);

  if (!state || state.date !== date) return null;
  const { c } = state;
  const mine = yourWins ?? state.you;
  const gap = mine == null ? null : c.wins - mine;
  return (
    <section aria-label={`Perfect five for ${shortDay(date)}`} className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-500">Perfect five · {shortDay(date)}</h3>
        <span className="text-[10px] text-zinc-400">best five from that day&apos;s spins</span>
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className={`font-display text-3xl tabular-nums ${GRADE_COLOR[c.grade] ?? "text-zinc-200"}`}>{c.wins}-{c.losses}</span>
        <span className="text-sm font-semibold text-zinc-300">{c.grade} {c.label}</span>
      </div>
      {gap != null && (
        <p className="mt-1 text-xs text-zinc-400">
          {gap > 0 ? `You went ${mine}-${82 - mine!}: ${gap} win${gap === 1 ? "" : "s"} off it.` : gap === 0 ? "You matched it." : `You went ${mine}-${82 - mine!} and beat it with re-spins.`}
        </p>
      )}
      <div className="mt-3">
        <FiveStrip title="The five" five={c.lineup} href={`/r/${c.seg}`} />
      </div>
    </section>
  );
}
