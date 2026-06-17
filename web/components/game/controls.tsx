import React from "react";
import { DEFAULT_COEFFICIENTS } from "@/lib/engine";

// Live usage-budget bar: total engine usage demand of the five so far. In USAGE DISCIPLINE it
// carries the blueprint's grade lines (A+ ≤90, A line at 95); in every other mode it shows the
// engine's overload budget so the dominant penalty is felt BEFORE the reveal, not after.
// Budget/gamma are read off the engine defaults so the bar can never drift from the math.
const USAGE_BAR_MAX = 140; // display scale — casual fives land ~120-140, so the bar visibly fills
const BUDGET = DEFAULT_COEFFICIENTS.usageBudget;
const GAMMA = DEFAULT_COEFFICIENTS.overloadGamma;
export function UsageBar({ total, discipline = false }: { total: number; discipline?: boolean }) {
  const pct = Math.min(100, (total / USAGE_BAR_MAX) * 100);
  const color = total <= 90 ? "bg-green-400/80" : total <= 95 ? "bg-lime-400/80" : total <= BUDGET ? "bg-amber-400/80" : "bg-red-400/80";
  const mark = (v: number) => `${(v / USAGE_BAR_MAX) * 100}%`;
  const over = total - BUDGET;
  return (
    <div className="mx-auto mt-3 w-full max-w-sm">
      <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wide text-zinc-500">
        <span>⚖️ Usage limit</span>
        <span className={`tabular-nums ${total <= 90 ? "text-green-400" : total <= 95 ? "text-lime-400" : total <= BUDGET ? "text-amber-400" : "text-red-400"}`}>
          {total.toFixed(1)}% {discipline ? "/ A+ ≤90" : `/ limit ${BUDGET}`}
        </span>
      </div>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-zinc-800" role="img"
        aria-label={`Total usage demand ${total.toFixed(1)} percent — ${discipline ? "A+ at 90 or under, " : ""}the engine's overload penalty starts past ${BUDGET}`}>
        <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
        {discipline && <div className="absolute inset-y-0 w-px bg-zinc-400/70" style={{ left: mark(95) }} title="A grade line (95)" />}
        <div className="absolute inset-y-0 w-px bg-red-400/70" style={{ left: mark(BUDGET) }} title={`Engine overload limit (${BUDGET})`} />
      </div>
      {over > 0 ? (
        <p className="mt-1 text-center text-[10px] text-red-400/80">
          Over the limit — forcing this much ball-dominance costs about {(over * GAMMA).toFixed(1)} points of scoring at reveal.
        </p>
      ) : !discipline ? (
        // Disclose the RULE before the line is crossed: going over the budget is a penalty, not a hard cap.
        // Zero basketball knowledge in this — it just stops players treating 110 as a block they must not pass.
        <p className="mt-1 text-center text-[10px] text-zinc-500">
          Going over {BUDGET} only docks points at reveal — it never blocks a pick.
        </p>
      ) : null}
    </div>
  );
}

export function SkipBtn({ label, used, onClick, disabled }: { label: string; used: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={used || disabled}
      // Scope is per-GAME, not per-round (skips reset only in start()) — say so, framed as expiry, since
      // the failure mode is hoarding re-spins to the end and losing them, not misreading the count.
      title="One per game — doesn't carry over between rounds"
      className={`rounded-xl border px-4 py-2 font-semibold transition active:scale-95 ${
        used ? "border-zinc-800 text-zinc-700 line-through" : "border-zinc-700 text-zinc-300 hover:border-orange-500 hover:text-orange-400"}`}>
      {label}{used ? " · used" : ""}
    </button>
  );
}
