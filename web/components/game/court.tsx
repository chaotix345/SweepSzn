import React from "react";
import type { DraftCandidate, Slot } from "@/lib/types";
import { SLOTS, teamColors, initials } from "@/lib/teams";

type Roster = Record<Slot, DraftCandidate | null>;

// court slot positions (% of the half-court panel; basket at top)
export const COURT: Record<Slot, { left: number; top: number }> = {
  C: { left: 34, top: 21 }, PF: { left: 62, top: 21 },
  SF: { left: 15, top: 49 }, SG: { left: 79, top: 49 }, PG: { left: 47, top: 68 },
};

export function Court({ roster, selSlot, isTarget, onSlot, maskColors }: {
  roster: Roster; selSlot: Slot | null; isTarget: (s: Slot) => boolean; onSlot: (s: Slot) => void; maskColors?: boolean;
}) {
  return (
    <div className="relative mx-auto aspect-[4/3.4] w-full max-w-sm overflow-hidden rounded-2xl border border-zinc-800 bg-gradient-to-b from-[#14223b] to-[#0c1626] lg:sticky lg:top-4">
      <svg viewBox="0 0 100 85" className="absolute inset-0 h-full w-full text-zinc-600/40" fill="none" stroke="currentColor" strokeWidth="0.6">
        <rect x="2" y="2" width="96" height="81" rx="2" />
        <rect x="38" y="2" width="24" height="30" />
        <circle cx="50" cy="32" r="9" />
        <path d="M10 2 A 40 40 0 0 0 90 2" />
        <line x1="2" y1="2" x2="98" y2="2" />
        <circle cx="50" cy="2" r="6" />
      </svg>
      {SLOTS.map((s) => {
        const p = roster[s];
        const target = isTarget(s);
        const picked = selSlot === s;
        const c = p ? (maskColors ? { bg: "#3f3f46", text: "#e4e4e7" } : teamColors(p.team)) : null;
        return (
          <button key={s} onClick={() => onSlot(s)} style={{ left: `${COURT[s].left}%`, top: `${COURT[s].top}%` }}
            aria-label={p ? `${p.name} at ${s}${target ? ", swap target" : ""}` : `${s} slot${target ? ", eligible — tap to place" : " (empty)"}`}
            className={`absolute -translate-x-1/2 -translate-y-1/2 transition ${target ? "animate-pulse" : ""}`}>
            {p && c ? (
              <span className={`flex h-14 w-14 flex-col items-center justify-center rounded-xl text-xs font-black leading-none shadow-lg ring-2 ${
                  picked ? "ring-orange-400" : target ? "ring-orange-400" : "ring-white/20"}`}
                style={{ background: c.bg, color: c.text }}>
                <span>{initials(p.name)}</span>
                <span className="mt-0.5 text-[8px] opacity-80">{s}</span>
              </span>
            ) : (
              <span className={`flex h-14 w-14 items-center justify-center rounded-xl border-2 border-dashed text-sm font-bold ${
                  target ? "border-orange-400 bg-orange-400/15 text-orange-300 ring-2 ring-orange-400" : "border-zinc-600/60 text-zinc-500"}`}>
                {s}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
