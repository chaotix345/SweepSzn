import React from "react";

// Live usage-budget bar for the USAGE DISCIPLINE blueprint: total engine usage demand of the five
// so far, against the A+ target (90), the grade line the spec names (95), and the engine's
// overload budget (100). The per-candidate numbers ride the bp-* spin response (lib/data.ts).
const USAGE_BAR_MAX = 130; // display scale — casual fives land ~120-140, so the bar visibly fills
export function UsageBar({ total }: { total: number }) {
  const pct = Math.min(100, (total / USAGE_BAR_MAX) * 100);
  const color = total <= 90 ? "bg-green-400/80" : total <= 95 ? "bg-lime-400/80" : total <= 100 ? "bg-amber-400/80" : "bg-red-400/80";
  const mark = (v: number) => `${(v / USAGE_BAR_MAX) * 100}%`;
  return (
    <div className="mx-auto mt-3 w-full max-w-sm">
      <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wide text-zinc-500">
        <span>⚖️ Usage budget</span>
        <span className={`tabular-nums ${total <= 90 ? "text-green-400" : total <= 95 ? "text-lime-400" : total <= 100 ? "text-amber-400" : "text-red-400"}`}>
          {total.toFixed(1)}% / A+ ≤90
        </span>
      </div>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-zinc-800" role="img"
        aria-label={`Total usage demand ${total.toFixed(1)} percent — A+ at 90 or under, overload past 100`}>
        <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
        <div className="absolute inset-y-0 w-px bg-zinc-400/70" style={{ left: mark(95) }} title="A grade line (95)" />
        <div className="absolute inset-y-0 w-px bg-red-400/70" style={{ left: mark(100) }} title="Engine overload budget (100)" />
      </div>
    </div>
  );
}

export function SkipBtn({ label, used, onClick, disabled }: { label: string; used: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={used || disabled}
      className={`rounded-full border px-3 py-1 font-semibold transition ${
        used ? "border-zinc-800 text-zinc-700 line-through" : "border-zinc-700 text-zinc-300 hover:border-orange-500 hover:text-orange-400"}`}>
      {label}{used ? " · used" : ""}
    </button>
  );
}
