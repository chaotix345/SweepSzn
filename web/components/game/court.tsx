import React from "react";
import type { DraftCandidate, Slot } from "@/lib/types";
import { SLOTS, teamColors, initials } from "@/lib/teams";

type Roster = Record<Slot, DraftCandidate | null>;

// court slot positions (% of the half-court panel; basket at top)
export const COURT: Record<Slot, { left: number; top: number }> = {
  C: { left: 34, top: 21 }, PF: { left: 62, top: 21 },
  SF: { left: 15, top: 49 }, SG: { left: 79, top: 49 }, PG: { left: 47, top: 68 },
};

// Compact lineup-status strip for mobile: your five at a glance, pinned above the candidate browser
// so you can see what you've drafted while you pick (the half-court sits below the fold on phones).
// Display-only — placement still happens via the bottom "choose position" sheet.
export function MiniRoster({ roster, maskColors }: { roster: Roster; maskColors?: boolean }) {
  return (
    <div className="mb-3 flex items-stretch gap-1.5 lg:hidden" role="img" aria-label={`Lineup so far: ${SLOTS.map((s) => (roster[s] ? `${s} ${roster[s]!.name}` : `${s} open`)).join(", ")}`}>
      {SLOTS.map((s) => {
        const p = roster[s];
        const c = p ? (maskColors ? { bg: "#3f3f46", text: "#e4e4e7" } : teamColors(p.team)) : null;
        return p && c ? (
          <span key={`${s}-${p.id}`} className="animate-token-snap flex h-10 flex-1 flex-col items-center justify-center rounded-lg text-[10px] font-black leading-none shadow"
            style={{ background: c.bg, color: c.text }}>
            <span>{initials(p.name)}</span>
            <span className="mt-0.5 text-[7px] opacity-80">{s}</span>
          </span>
        ) : (
          <span key={s} className="flex h-10 flex-1 items-center justify-center rounded-lg border border-dashed border-zinc-700 text-[10px] font-bold text-zinc-600">{s}</span>
        );
      })}
    </div>
  );
}

export function Court({ roster, selSlot, isTarget, onSlot, maskColors, idle }: {
  roster: Roster; selSlot: Slot | null; isTarget: (s: Slot) => boolean; onSlot: (s: Slot) => void; maskColors?: boolean;
  // idle = no pick/swap in progress; filled slots then advertise that tapping picks them up to move/swap
  // (the mechanic was implemented but undiscoverable pre-tap, and the textual hints were desktop-only).
  idle?: boolean;
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
        const movable = !!p && !!idle && !target; // a placed player, nothing else selected → tap to move
        const c = p ? (maskColors ? { bg: "#3f3f46", text: "#e4e4e7" } : teamColors(p.team)) : null;
        return (
          <button key={s} onClick={() => onSlot(s)} style={{ left: `${COURT[s].left}%`, top: `${COURT[s].top}%` }}
            title={movable ? "Tap to move" : undefined}
            aria-label={p ? `${p.name} at ${s}${target ? ", swap target" : movable ? ", tap to move" : ""}` : `${s} slot${target ? ", eligible — tap to place" : " (empty)"}`}
            className={`absolute -translate-x-1/2 -translate-y-1/2 transition ${target ? "animate-pulse" : ""}`}>
            {p && c ? (
              // key on the player id so the snap replays exactly when a slot fills (or a swap lands)
              <span key={p.id} className={`animate-token-snap relative flex h-14 w-14 flex-col items-center justify-center rounded-xl text-xs font-black leading-none shadow-lg ring-2 ${
                  picked ? "ring-orange-400" : target ? "ring-orange-400" : "ring-white/20"}`}
                style={{ background: c.bg, color: c.text }}>
                <span>{initials(p.name)}</span>
                <span className="mt-0.5 text-[8px] opacity-80">{s}</span>
                {/* subtle pre-tap affordance: this badge is draggable-by-tap to another slot */}
                {movable && <span className="absolute -bottom-1 -right-1 rounded-full bg-zinc-900/80 px-0.5 text-[8px] leading-none text-zinc-300 ring-1 ring-white/20" aria-hidden>⇄</span>}
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
